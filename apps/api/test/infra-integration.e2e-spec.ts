import {
  Controller,
  Get,
  INestApplication,
  NotFoundException,
  Query,
  Res,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { z } from 'zod';
import { apiErrorSchema } from '@commerce-platform/contracts';
import { buildCorsOptions } from '../src/shared/http/cors.config';
import { HttpModule } from '../src/shared/http/http.module';
import { SessionCookieHelper } from '../src/shared/http/session-cookie.helper';
import {
  resolvePublicTenantContext,
  ResolvedSite,
} from '../src/modules/tenancy/domain/tenant-context';
import { ZodValidationPipe } from '../src/shared/http/zod-validation.pipe';

const ADMIN_ORIGIN = 'http://localhost:3001';

// Representa o resultado de uma consulta ao `Site` por `slug` que, num
// endpoint real, viria do banco via Prisma. Fixo de propósito: este é um
// endpoint DE EXEMPLO (INF-009), não um módulo de domínio real (fora do
// escopo desta tarefa) — a busca de verdade fica para quando Tenancy tiver
// um repositório (fora da Fase 4).
const KNOWN_SITE: ResolvedSite = { id: 'example-site-id', slug: 'fastcompre' };

const healthTenantQuerySchema = z.object({
  siteSlug: z.string().min(1),
});

/**
 * Controller de exemplo (INF-009 — marco da Fase 4) que estende a ideia do
 * `/health` real para provar, num único endpoint, a composição de toda a
 * infraestrutura construída na Fase 4:
 * - `AllExceptionsFilter` global (INF-001, via `HttpModule`);
 * - `ZodValidationPipe` genérico (INF-003) na query;
 * - `SessionCookieHelper` (INF-004);
 * - CORS restritivo (INF-005, via `buildCorsOptions`);
 * - núcleo do `TenantContext` (INF-008).
 *
 * Não é o `HealthController` real (`src/health.controller.ts`): importar o
 * `DatabaseModule` na `AppModule` para viabilizar uma consulta real ao
 * `Site` faria até o `/health` básico — que hoje não depende de banco, por
 * desenho da DB-002 — passar a exigir Postgres só para responder. Como
 * "qualquer módulo de domínio real" está fora do escopo desta tarefa, o
 * "Site" usado aqui é um dado fixo de exemplo, não uma consulta real.
 */
@Controller('health-extended')
class ExtendedHealthController {
  constructor(private readonly cookieHelper: SessionCookieHelper) {}

  @Get('tenant')
  getTenant(
    @Query(new ZodValidationPipe(healthTenantQuerySchema))
    query: z.infer<typeof healthTenantQuerySchema>,
    @Res({ passthrough: true }) res: Response,
  ): { status: 'ok'; tenant: { siteId: string; siteSlug: string } } {
    const site = query.siteSlug === KNOWN_SITE.slug ? KNOWN_SITE : null;
    const result = resolvePublicTenantContext(site);

    if (!result.ok) {
      throw new NotFoundException('Site não encontrado.');
    }

    this.cookieHelper.setCookie(
      res,
      'health_tenant_demo',
      result.context.siteId,
      { maxAgeMs: 60_000 },
    );

    return { status: 'ok', tenant: result.context };
  }
}

describe('Infraestrutura da Fase 4 combinada (e2e) — INF-009', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      controllers: [ExtendedHealthController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableCors(buildCorsOptions(ADMIN_ORIGIN));
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('siteSlug conhecido: 200, TenantContext correto, cookie de sessão setado, CORS refletido', async () => {
    const response = await request(app!.getHttpServer())
      .get('/health-extended/tenant')
      .query({ siteSlug: 'fastcompre' })
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      tenant: { siteId: 'example-site-id', siteSlug: 'fastcompre' },
    });

    expect(response.headers['access-control-allow-origin']).toBe(
      ADMIN_ORIGIN,
    );

    const setCookieHeader = response.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader];
    const tenantCookie = cookies.find((cookie: string) =>
      cookie.startsWith('health_tenant_demo='),
    );
    expect(tenantCookie).toBeDefined();
    expect(tenantCookie).toContain('HttpOnly');
    expect(tenantCookie).toContain('SameSite=Lax');
  });

  it('siteSlug desconhecido: 404 tratado pelo AllExceptionsFilter, corpo é um ApiError válido', async () => {
    const response = await request(app!.getHttpServer())
      .get('/health-extended/tenant')
      .query({ siteSlug: 'site-que-nao-existe' });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.statusCode).toBe(404);
  });

  it('siteSlug ausente: 422 pelo ZodValidationPipe, corpo é um ApiError válido', async () => {
    const response = await request(app!.getHttpServer()).get(
      '/health-extended/tenant',
    );

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.message).toContain('siteSlug');
  });

  it('origem cross-site não recebe header de CORS, mas a requisição em si não é bloqueada (nenhum guard de Origin aplicado nesta rota)', async () => {
    const response = await request(app!.getHttpServer())
      .get('/health-extended/tenant')
      .query({ siteSlug: 'fastcompre' })
      .set('Origin', 'http://evil.example.com');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
