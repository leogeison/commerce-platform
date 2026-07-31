import type { TenantContext } from '../domain/tenant-context';

/**
 * Augmentação de `Express.Request` para o `TenantContext` anexado por
 * `SiteAuthorizationGuard` (AUTH-009) — mesmo padrão de
 * `identity/presentation/auth-context.ts` (AUTH-006), em arquivo próprio
 * de `tenancy/presentation/` porque `TenantContext` é um conceito de
 * multi-tenancy (INF-008), não de identidade/autenticação.
 *
 * Só `{ siteId, siteSlug }` (o próprio `TenantContext`, imutável) — nunca o
 * `SiteUser`/`Site` do Prisma inteiro. A Role já foi validada pelo guard
 * antes de anexar; não há consumidor previsto no backlog que precise da
 * Role aqui, então o contexto não é ampliado com ela.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- augmentação de `Express.Request` (de @types/express) exige exatamente esta sintaxe; não é organização de código próprio em namespace.
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}
