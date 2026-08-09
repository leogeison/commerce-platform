import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { uploadImageResponseSchema } from '@commerce-platform/contracts';
import { UploadsModule } from '../src/modules/uploads/uploads.module';
import {
  STORAGE_PORT,
  type StoragePort,
  type UploadStorageInput,
} from '../src/modules/uploads/domain/storage.port';
import { MAX_IMAGE_SIZE_BYTES } from '../src/modules/uploads/domain/upload-policy';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Role } from '../src/generated/prisma/enums';
import type { Site, User } from '../src/generated/prisma/client';

const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'upl009-user@test.com';

const VALID_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);
const GIF_BYTES = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const OVERSIZED_BUFFER = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1, 0xff);
const SAFE_FILE_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i;

/**
 * `POST /admin/sites/:siteSlug/uploads/images` (e2e, UPL-009/UPL-010).
 * Caminho feliz (UPL-009) e arquivo inválido via HTTP completo — MIME
 * incorreto, tamanho excedido, nome malicioso (UPL-010, backlog reservou
 * esta tarefa exatamente para essa cobertura e2e; as mesmas regras já têm
 * cobertura unitária em `upload-image.controller.spec.ts`/
 * `detect-image-mime-type.spec.ts`, isolada de HTTP).
 *
 * Monta `UploadsModule` diretamente (não `AppModule`/`ApplicationModule`) —
 * mesmo padrão de `create-category.e2e-spec.ts` com `CatalogModule`.
 * `STORAGE_PORT` é sobrescrito por um fake em memória: nenhuma chamada real
 * ao S3/provedor configurado. Sessão/tenancy continuam reais (exigem
 * Postgres, mesmo requisito de todo e2e existente).
 */
describe('POST /admin/sites/:siteSlug/uploads/images (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let site: Site;
  let token: string;
  let fakeStoragePort: StoragePort;

  beforeEach(async () => {
    fakeStoragePort = {
      upload: jest.fn().mockResolvedValue({ url: 'memory://fake-upload.jpg' }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UploadsModule],
    })
      .overrideProvider(STORAGE_PORT)
      .useValue(fakeStoragePort)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Upl009 User',
      },
    });

    site = await prisma.site.create({
      data: {
        slug: 'upl009-site',
        name: 'Upl009 Site',
        domain: 'upl009-site.test.com',
        locale: 'pt-BR',
      },
    });

    await prisma.siteUser.create({
      data: { userId: user.id, siteId: site.id, role: Role.EDITOR, active: true },
    });

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);
    await prisma.session.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    token = rawToken;
  });

  afterEach(async () => {
    await prisma.siteUser.deleteMany({ where: { site: { slug: 'upl009-site' } } });
    await prisma.site.deleteMany({ where: { slug: 'upl009-site' } });
    if (user?.id) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  function cookieHeader(): string {
    return `${ADMIN_SESSION_COOKIE_NAME}=${token}`;
  }

  it('EDITOR envia um JPEG válido: 201, corpo válido contra uploadImageResponseSchema, delega ao StoragePort', async () => {
    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/uploads/images`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .field('purpose', 'PRODUCT')
      .attach('file', VALID_JPEG_BYTES, 'foto.jpg');

    expect(response.status).toBe(201);

    const parsed = uploadImageResponseSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
    expect(response.body).toEqual({ url: 'memory://fake-upload.jpg' });
    expect(fakeStoragePort.upload).toHaveBeenCalledTimes(1);
  });

  it('MIME inválido (bytes reais de GIF): 400, mensagem correta, StoragePort nunca chamado', async () => {
    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/uploads/images`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .field('purpose', 'PRODUCT')
      .attach('file', GIF_BYTES, 'foto.gif');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Formato de arquivo não permitido.');
    expect(fakeStoragePort.upload).not.toHaveBeenCalled();
  });

  /**
   * `413`, não o `400` da checagem defensiva do controller: como
   * `FileInterceptor` é configurado com `limits: { fileSize:
   * MAX_IMAGE_SIZE_BYTES }` (UPL-005), o Multer já rejeita o arquivo
   * durante o parse do multipart — o controller nunca chega a rodar. Ver
   * comentário de `upload-image.controller.ts` (`transformException` do
   * `@nestjs/platform-express` converte `LIMIT_FILE_SIZE` em
   * `PayloadTooLargeException`). Não força o branch `400` do controller
   * aqui — ele já é coberto isoladamente em
   * `upload-image.controller.spec.ts`.
   */
  it('arquivo acima de 5 MiB: 413 (bloqueado pelo Multer/FileInterceptor antes do controller), StoragePort nunca chamado', async () => {
    const response = await request(app!.getHttpServer())
      .post(`/admin/sites/${site.slug}/uploads/images`)
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .field('purpose', 'PRODUCT')
      .attach('file', OVERSIZED_BUFFER, 'foto-grande.jpg');

    expect(response.status).toBe(413);
    expect(fakeStoragePort.upload).not.toHaveBeenCalled();
  });

  /**
   * `generateSafeFileName` (UPL-006) nunca lê `originalname` — por design,
   * não por sanitização. Estes dois testes provam isso via HTTP real: o
   * `fileName` que chega à `StoragePort` (e a URL retornada, que o fake
   * monta a partir dele) é sempre UUID + extensão do MIME detectado, sem
   * nenhum traço do `originalname` malicioso enviado.
   */
  it.each([
    ['Unix', '../../../etc/passwd.jpg'],
    ['Windows', '..\\..\\windows\\system32\\evil.jpg'],
  ])(
    'path traversal no originalname (variante %s): 201, fileName/URL seguros, sem trechos do originalname malicioso',
    async (_variant, maliciousOriginalName) => {
      (fakeStoragePort.upload as jest.Mock).mockImplementationOnce(
        (input: UploadStorageInput) => Promise.resolve({ url: `memory://${input.fileName}` }),
      );

      const response = await request(app!.getHttpServer())
        .post(`/admin/sites/${site.slug}/uploads/images`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN)
        .field('purpose', 'PRODUCT')
        .attach('file', VALID_JPEG_BYTES, maliciousOriginalName);

      expect(response.status).toBe(201);

      const call = (fakeStoragePort.upload as jest.Mock).mock.calls[0][0] as UploadStorageInput;

      expect(call.fileName).toMatch(SAFE_FILE_NAME_PATTERN);
      for (const forbidden of ['..', 'etc', 'passwd', 'windows', 'system32']) {
        expect(call.fileName.toLowerCase()).not.toContain(forbidden);
        expect(response.body.url.toLowerCase()).not.toContain(forbidden);
      }
    },
  );
});
