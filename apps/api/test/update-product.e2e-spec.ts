import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiErrorSchema, productAdminSchema } from '@commerce-platform/contracts';
import { ApplicationModule } from '../src/modules/application/application.module';
import { REVALIDATION_PORT, type RevalidationPort } from '../src/modules/revalidation/domain/revalidation.port';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { PrismaService } from '../src/shared/database/prisma.service';
import { ArticleStatus, ArticleType, Role } from '../src/generated/prisma/enums';
import type { Category, Product, Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN`/`SESSION_SECRET` sempre
// existem em `process.env` (real do `.env` ou fallback fictício) — seguro
// usar `!`, mesmo padrão dos demais e2e do projeto.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SESSION_SECRET = process.env.SESSION_SECRET!;
const USER_EMAIL = 'rev010-user@test.com';
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `PATCH /admin/sites/:siteSlug/products/:id` (e2e). Exige Postgres real
 * (mesmo requisito dos demais e2e do projeto).
 *
 * `RevalidationPort` é sobrescrita por um fake — este teste prova a
 * orquestração (atualizar + tentar coordenar revalidação via REV-005 +
 * nunca desfazer a atualização por falha de revalidação), não a chamada
 * HTTP real de `HttpRevalidationAdapter` (já coberta em
 * `http-revalidation.adapter.spec.ts`). Mesma estrutura de
 * `update-category.e2e-spec.ts` (REV-009), com cobertura adicional para os
 * campos tri-state extras de Produto (`categoryId`/`description`/`imageUrl`),
 * a validação de FK `categoryId` (CATEGORY_NOT_FOUND), a prova de
 * atomicidade e a descoberta via `ArticleProduct`.
 */
describe('PATCH /admin/sites/:siteSlug/products/:id (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let user: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let token: string;
  let revalidationPort: jest.Mocked<RevalidationPort>;

  beforeEach(async () => {
    revalidationPort = { revalidate: jest.fn().mockResolvedValue(undefined) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApplicationModule],
    })
      .overrideProvider(REVALIDATION_PORT)
      .useValue(revalidationPort)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    user = await prisma.user.create({
      data: {
        email: USER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Rev010 User',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'rev010-site-a',
        name: 'Rev010 Site A',
        domain: 'rev010-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'rev010-site-b',
        name: 'Rev010 Site B',
        domain: 'rev010-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);
    await prisma.session.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    token = rawToken;
  });

  afterEach(async () => {
    // `user` pode nunca ter sido atribuído se o `beforeEach` falhar antes
    // (ex.: Postgres indisponível) — mesmo cuidado já usado nos demais e2e.
    await prisma.articleProduct.deleteMany({
      where: { product: { site: { slug: { startsWith: 'rev010-' } } } },
    });
    await prisma.article.deleteMany({
      where: { site: { slug: { startsWith: 'rev010-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'rev010-' } } },
    });
    await prisma.category.deleteMany({
      where: { site: { slug: { startsWith: 'rev010-' } } },
    });
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'rev010-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'rev010-' } } });
    if (user?.id) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function setRole(site: Site, role: Role): Promise<void> {
    await prisma.siteUser.deleteMany({ where: { userId: user!.id, siteId: site.id } });
    await prisma.siteUser.create({
      data: { userId: user!.id, siteId: site.id, role, active: true },
    });
  }

  function cookieHeader(): string {
    return `${ADMIN_SESSION_COOKIE_NAME}=${token}`;
  }

  function patchUrl(site: Site, productId: string): string {
    return `/admin/sites/${site.slug}/products/${productId}`;
  }

  async function createCategory(site: Site, name: string, slug: string): Promise<Category> {
    return prisma.category.create({ data: { siteId: site.id, name, slug } });
  }

  async function createProduct(
    site: Site,
    name: string,
    slug: string,
    overrides: Partial<{
      categoryId: string | null;
      description: string | null;
      imageUrl: string | null;
      archived: boolean;
    }> = {},
  ): Promise<Product> {
    return prisma.product.create({
      data: {
        siteId: site.id,
        name,
        slug,
        categoryId: overrides.categoryId ?? null,
        description: overrides.description ?? null,
        imageUrl: overrides.imageUrl ?? null,
        archivedAt: overrides.archived ? new Date() : null,
      },
    });
  }

  it('EDITOR atualiza Produto sem Artigo afetado: 200, persistido, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Fone Bluetooth', 'fone-bluetooth');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Fone Bluetooth Pro', slug: 'fone-bluetooth-pro' });

    expect(response.status).toBe(200);
    expect(productAdminSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.name).toBe('Fone Bluetooth Pro');
    expect(response.body.slug).toBe('fone-bluetooth-pro');

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.name).toBe('Fone Bluetooth Pro');
    expect(persisted?.slug).toBe('fone-bluetooth-pro');

    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('Artigo PUBLISHED referencia o Produto via ArticleProduct: PATCH persiste, e REV-005/APP-005 encontra o Artigo — revalidate recebe siteSlug do Site e articleSlug do Artigo', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Cafeteira', 'cafeteira');
    const article = await prisma.article.create({
      data: {
        siteId: siteA.id,
        title: 'Melhores cafeteiras 2026',
        slug: 'melhores-cafeteiras-2026',
        type: ArticleType.REVIEW,
        status: ArticleStatus.PUBLISHED,
      },
    });
    await prisma.articleProduct.create({
      data: { siteId: siteA.id, articleId: article.id, productId: product.id },
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Cafeteira Elétrica' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Cafeteira Elétrica');

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.name).toBe('Cafeteira Elétrica');

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({
      siteSlug: siteA.slug,
      articleSlug: article.slug,
    });
  });

  it('PATCH parcial: só o campo enviado muda, os demais permanecem', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'Eletrodomésticos', 'eletrodomesticos');
    const product = await createProduct(siteA, 'Liquidificador', 'liquidificador', {
      categoryId: category.id,
      description: 'Descrição original',
      imageUrl: 'https://example.com/original.png',
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Liquidificador Turbo' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Liquidificador Turbo');
    expect(response.body.categoryId).toBe(category.id);
    expect(response.body.description).toBe('Descrição original');
    expect(response.body.imageUrl).toBe('https://example.com/original.png');

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.categoryId).toBe(category.id);
    expect(persisted?.description).toBe('Descrição original');
    expect(persisted?.imageUrl).toBe('https://example.com/original.png');
  });

  it('PATCH vazio ({}): 200, Produto devolvido sem nenhuma alteração', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Mouse Gamer', 'mouse-gamer');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Mouse Gamer');
    expect(response.body.slug).toBe('mouse-gamer');

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.name).toBe('Mouse Gamer');
    expect(persisted?.slug).toBe('mouse-gamer');
  });

  it('categoryId: null explícito limpa a categoria (tri-state)', async () => {
    await setRole(siteA, Role.EDITOR);
    const category = await createCategory(siteA, 'Informática', 'informatica');
    const product = await createProduct(siteA, 'Teclado', 'teclado', { categoryId: category.id });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ categoryId: null });

    expect(response.status).toBe(200);
    expect(response.body.categoryId).toBeNull();

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.categoryId).toBeNull();
  });

  it('description: null explícito limpa a descrição (tri-state)', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Monitor', 'monitor', {
      description: 'Descrição a ser removida',
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ description: null });

    expect(response.status).toBe(200);
    expect(response.body.description).toBeNull();

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.description).toBeNull();
  });

  it('imageUrl: null explícito limpa a imagem (tri-state)', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Webcam', 'webcam', {
      imageUrl: 'https://example.com/webcam.png',
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ imageUrl: null });

    expect(response.status).toBe(200);
    expect(response.body.imageUrl).toBeNull();

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.imageUrl).toBeNull();
  });

  it('id inexistente no próprio Site: 404, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.EDITOR);

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, NONEXISTENT_ID))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Não existe' });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('id de Produto real de outro Site: 404 (isolamento), revalidação nunca chamada', async () => {
    await setRole(siteA, Role.EDITOR);
    const productFromSiteB = await createProduct(siteB, 'Do Site B', 'do-site-b');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, productFromSiteB.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Tentativa cross-site' });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.product.findUnique({ where: { id: productFromSiteB.id } });
    expect(persisted?.name).toBe('Do Site B');
  });

  it('slug conflitante com outro Produto do mesmo Site: 409, nada persistido, revalidação nunca chamada', async () => {
    await setRole(siteA, Role.EDITOR);
    await createProduct(siteA, 'Panela', 'panela');
    const product = await createProduct(siteA, 'Frigideira', 'frigideira');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ slug: 'panela' });

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.slug).toBe('frigideira');
  });

  it('categoryId inexistente: 422, nada persistido', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Air Fryer', 'air-fryer');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ categoryId: NONEXISTENT_ID });

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.categoryId).toBeNull();
  });

  it('categoryId de Categoria real de outro Site: 422, nada persistido', async () => {
    await setRole(siteA, Role.EDITOR);
    const categoryFromSiteB = await createCategory(siteB, 'Categoria do Site B', 'categoria-site-b');
    const product = await createProduct(siteA, 'Ventilador', 'ventilador');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ categoryId: categoryFromSiteB.id });

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.categoryId).toBeNull();
  });

  it('atomicidade: categoryId inválido junto de name válido — nem categoryId nem name persistem', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Aspirador', 'aspirador');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Aspirador Robô', categoryId: NONEXISTENT_ID });

    expect(response.status).toBe(422);

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.name).toBe('Aspirador');
    expect(persisted?.categoryId).toBeNull();
  });

  it('Produto arquivado continua editável: 200, name atualizado, archivedAt preservado (comparado explicitamente antes/depois)', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Torradeira', 'torradeira', { archived: true });
    const archivedAtBefore = product.archivedAt;
    expect(archivedAtBefore).not.toBeNull();

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Torradeira Elétrica' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Torradeira Elétrica');

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.name).toBe('Torradeira Elétrica');
    expect(persisted?.archivedAt?.toISOString()).toBe(archivedAtBefore!.toISOString());
  });

  it('falha de revalidação não desfaz a atualização (200, persistido, sem propagar erro)', async () => {
    await setRole(siteA, Role.EDITOR);
    revalidationPort.revalidate.mockRejectedValue(new Error('revalidação indisponível'));
    const product = await createProduct(siteA, 'Micro-ondas', 'micro-ondas');
    const article = await prisma.article.create({
      data: {
        siteId: siteA.id,
        title: 'Melhores micro-ondas',
        slug: 'melhores-micro-ondas',
        type: ArticleType.REVIEW,
        status: ArticleStatus.PUBLISHED,
      },
    });
    await prisma.articleProduct.create({
      data: { siteId: siteA.id, articleId: article.id, productId: product.id },
    });

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Micro-ondas Digital' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Micro-ondas Digital');

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.name).toBe('Micro-ondas Digital');
    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
  });

  it('Role insuficiente (VIEWER): 403, nada persistido', async () => {
    await setRole(siteA, Role.VIEWER);
    const product = await createProduct(siteA, 'Caixa de Som', 'caixa-de-som');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Tentativa sem permissão' });

    expect(response.status).toBe(403);

    const persisted = await prisma.product.findUnique({ where: { id: product.id } });
    expect(persisted?.name).toBe('Caixa de Som');
    expect(revalidationPort.revalidate).not.toHaveBeenCalled();
  });

  it('Origin inválida: 403', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Smartwatch', 'smartwatch');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Cookie', cookieHeader())
      .set('Origin', 'https://origem-nao-autorizada.test.com')
      .send({ name: 'Tentativa' });

    expect(response.status).toBe(403);
  });

  it('sem autenticação (sem cookie): 401', async () => {
    await setRole(siteA, Role.EDITOR);
    const product = await createProduct(siteA, 'Fone de Ouvido', 'fone-de-ouvido');

    const response = await request(app!.getHttpServer())
      .patch(patchUrl(siteA, product.id))
      .set('Origin', ADMIN_ORIGIN)
      .send({ name: 'Tentativa' });

    expect(response.status).toBe(401);
  });
});
