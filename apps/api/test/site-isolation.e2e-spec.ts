import {
  Body,
  Controller,
  Get,
  INestApplication,
  NotFoundException,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Request } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { SessionAuthGuard } from '../src/modules/identity/presentation/session-auth.guard';
import { ADMIN_SESSION_COOKIE_NAME } from '../src/modules/identity/session.constants';
import {
  generateSessionToken,
  hashSessionToken,
} from '../src/modules/identity/domain/session-token';
import { TenancyModule } from '../src/modules/tenancy/tenancy.module';
import { SiteAuthorizationGuard } from '../src/modules/tenancy/presentation/site-authorization.guard';
import { MinRole } from '../src/modules/tenancy/presentation/min-role.decorator';
import { OriginGuard } from '../src/shared/http/origin.guard';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Role } from '../src/generated/prisma/enums';
import type { Site, User } from '../src/generated/prisma/client';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN` sempre existe em
// `process.env` (real do `.env` ou fallback fictício) — seguro usar `!`.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const ATTACKER_EMAIL = 'auth010-attacker@test.com';
const VICTIM_EMAIL = 'auth010-victim@test.com';
const SESSION_SECRET = process.env.SESSION_SECRET!;

/**
 * Controllers só de teste (AUTH-010) — nenhum existe em produção. Ao
 * contrário do `TestSiteController` da AUTH-009 (que só devolvia
 * `request.tenant`), estas rotas fazem leitura/escrita reais via Prisma
 * depois dos guards, sempre restritas por `request.tenant.siteId` — nunca
 * pelo `siteSlug` bruto de novo, e nunca só pelo `id` do recurso.
 *
 * `PATCH` leva `OriginGuard` também (rota mutável autenticada por cookie,
 * mesma exigência do login/logout — Architecture.md Seção 15, proteção
 * CSRF). `GET` não.
 */
@Controller('test-isolation/sites/:siteSlug')
class TestIsolationSiteController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async read(@Req() req: Request) {
    return this.prisma.site.findUniqueOrThrow({
      where: { id: req.tenant!.siteId },
      select: { id: true, slug: true, name: true },
    });
  }

  @Patch()
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  async update(@Req() req: Request, @Body() body: { name: string }) {
    return this.prisma.site.update({
      where: { id: req.tenant!.siteId },
      data: { name: body.name },
      select: { id: true, slug: true, name: true },
    });
  }
}

@Controller('test-isolation/site-users/:siteSlug')
class TestIsolationSiteUserController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':membershipId')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  async read(
    @Req() req: Request,
    @Param('membershipId') membershipId: string,
  ) {
    // `findFirst` com `id` + `siteId` juntos: um `membershipId` real de
    // outro Site não bate no filtro composto — 404, nunca vaza o registro.
    const membership = await this.prisma.siteUser.findFirst({
      where: { id: membershipId, siteId: req.tenant!.siteId },
      select: { id: true, siteId: true, userId: true, role: true, active: true },
    });

    if (!membership) {
      throw new NotFoundException();
    }

    return membership;
  }

  @Patch(':membershipId')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('OWNER')
  async update(
    @Req() req: Request,
    @Param('membershipId') membershipId: string,
    @Body() body: { role: Role },
  ) {
    // `updateMany` (não `update`) de propósito: `update` por `id` sozinho
    // alteraria o registro mesmo pertencendo a outro Site (e lançaria só se
    // o `id` não existisse em lugar nenhum). `updateMany` com `id` + `siteId`
    // no `where` só afeta a linha se as duas condições baterem juntas —
    // `count: 0` cobre tanto "id não existe" quanto "id existe, mas é de
    // outro Site", sem distinguir os dois casos pra fora.
    const result = await this.prisma.siteUser.updateMany({
      where: { id: membershipId, siteId: req.tenant!.siteId },
      data: { role: body.role },
    });

    if (result.count === 0) {
      throw new NotFoundException();
    }

    return { updated: true };
  }
}

/**
 * AUTH-010 — suíte dedicada de isolamento entre Sites. Exige Postgres real
 * (mesmo requisito de `database.e2e-spec.ts`).
 *
 * Dois Sites (A e B), dois usuários: `attacker` (OWNER só do Site A) e
 * `victim` (membro só do Site B) — `attacker` nunca tem `SiteUser` no Site
 * B. Todas as requisições autenticadas usam a sessão do `attacker`.
 */
describe('Isolamento entre Sites (e2e, dedicado — AUTH-010)', () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;
  let attacker: User | undefined;
  let victim: User | undefined;
  let siteA: Site;
  let siteB: Site;
  let membershipAId: string;
  let membershipBId: string;
  let attackerToken: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [IdentityModule, TenancyModule],
      controllers: [TestIsolationSiteController, TestIsolationSiteUserController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    attacker = await prisma.user.create({
      data: {
        email: ATTACKER_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Auth010 Attacker',
      },
    });
    victim = await prisma.user.create({
      data: {
        email: VICTIM_EMAIL,
        passwordHash: 'fixture-hash-not-a-real-password',
        name: 'Auth010 Victim',
      },
    });

    siteA = await prisma.site.create({
      data: {
        slug: 'auth010-site-a',
        name: 'Auth010 Site A',
        domain: 'auth010-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'auth010-site-b',
        name: 'Auth010 Site B',
        domain: 'auth010-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    const membershipA = await prisma.siteUser.create({
      data: { userId: attacker.id, siteId: siteA.id, role: Role.OWNER, active: true },
    });
    const membershipB = await prisma.siteUser.create({
      data: { userId: victim.id, siteId: siteB.id, role: Role.EDITOR, active: true },
    });
    membershipAId = membershipA.id;
    membershipBId = membershipB.id;

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(SESSION_SECRET, rawToken);
    await prisma.session.create({
      data: { userId: attacker.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    attackerToken = rawToken;
  });

  afterEach(async () => {
    // `attacker`/`victim` podem nunca ter sido atribuídos se o `beforeEach`
    // falhar antes (ex.: Postgres indisponível) — acesso condicional aqui
    // evita que a limpeza lance `TypeError` e mascare o erro original do
    // `beforeEach` com um erro sem relação nenhuma com a causa raiz.
    const userIds = [attacker?.id, victim?.id].filter(
      (id): id is string => Boolean(id),
    );

    if (userIds.length > 0) {
      await prisma.siteUser.deleteMany({ where: { userId: { in: userIds } } });
    }
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'auth010-' } } });
    if (attacker?.id) {
      await prisma.session.deleteMany({ where: { userId: attacker.id } });
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  function cookieHeader(): string {
    return `${ADMIN_SESSION_COOKIE_NAME}=${attackerToken}`;
  }

  describe('Site', () => {
    it('OWNER do Site A lê e altera o próprio Site A: 200, alteração persistida', async () => {
      const read = await request(app!.getHttpServer())
        .get(`/test-isolation/sites/${siteA.slug}`)
        .set('Cookie', cookieHeader());
      expect(read.status).toBe(200);
      expect(read.body).toEqual({ id: siteA.id, slug: siteA.slug, name: siteA.name });

      const write = await request(app!.getHttpServer())
        .patch(`/test-isolation/sites/${siteA.slug}`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN)
        .send({ name: 'Auth010 Site A Renomeado' });
      expect(write.status).toBe(200);

      const persisted = await prisma.site.findUniqueOrThrow({ where: { id: siteA.id } });
      expect(persisted.name).toBe('Auth010 Site A Renomeado');
    });

    it('OWNER do Site A tentando ler/alterar o Site B pelo siteSlug: 403, dados do Site B inalterados', async () => {
      const read = await request(app!.getHttpServer())
        .get(`/test-isolation/sites/${siteB.slug}`)
        .set('Cookie', cookieHeader());
      expect(read.status).toBe(403);

      const write = await request(app!.getHttpServer())
        .patch(`/test-isolation/sites/${siteB.slug}`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN)
        .send({ name: 'Nome forjado pelo atacante' });
      expect(write.status).toBe(403);

      const persisted = await prisma.site.findUniqueOrThrow({ where: { id: siteB.id } });
      expect(persisted.name).toBe(siteB.name);
    });
  });

  describe('SiteUser', () => {
    it('OWNER do Site A lê e altera um SiteUser do próprio Site A: 200, alteração persistida', async () => {
      const read = await request(app!.getHttpServer())
        .get(`/test-isolation/site-users/${siteA.slug}/${membershipAId}`)
        .set('Cookie', cookieHeader());
      expect(read.status).toBe(200);
      expect(read.body).toEqual({
        id: membershipAId,
        siteId: siteA.id,
        // `attacker!`: dentro de um `it`, o `beforeEach` já rodou e
        // atribuiu `attacker` com certeza (garantia do próprio Jest) — só
        // fica `undefined` se o `beforeEach` falhar antes, caso em que o
        // teste já teria falhado ali, nunca chegando aqui.
        userId: attacker!.id,
        role: Role.OWNER,
        active: true,
      });

      const write = await request(app!.getHttpServer())
        .patch(`/test-isolation/site-users/${siteA.slug}/${membershipAId}`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN)
        .send({ role: Role.EDITOR });
      expect(write.status).toBe(200);

      const persisted = await prisma.siteUser.findUniqueOrThrow({
        where: { id: membershipAId },
      });
      expect(persisted.role).toBe(Role.EDITOR);
    });

    it('URL autorizada do Site A + membershipId de um SiteUser do Site B: 404, dados do Site B inalterados', async () => {
      const read = await request(app!.getHttpServer())
        .get(`/test-isolation/site-users/${siteA.slug}/${membershipBId}`)
        .set('Cookie', cookieHeader());
      expect(read.status).toBe(404);

      const write = await request(app!.getHttpServer())
        .patch(`/test-isolation/site-users/${siteA.slug}/${membershipBId}`)
        .set('Cookie', cookieHeader())
        .set('Origin', ADMIN_ORIGIN)
        .send({ role: Role.OWNER });
      expect(write.status).toBe(404);

      const persisted = await prisma.siteUser.findUniqueOrThrow({
        where: { id: membershipBId },
      });
      expect(persisted.role).toBe(Role.EDITOR);
      expect(persisted.siteId).toBe(siteB.id);
    });
  });
});
