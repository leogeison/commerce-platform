import { SetMetadata } from '@nestjs/common';
import type { Role } from '@commerce-platform/contracts';

export const MIN_ROLE_METADATA_KEY = 'siteAuthorization:minRole';

/**
 * Role mínima exigida pela rota (AUTH-009). Lida depois pelo
 * `SiteAuthorizationGuard` via `Reflector`.
 *
 * Ao contrário do `@RateLimit`/`RateLimitGuard` (onde ausência do
 * decorator deixa a requisição passar), `SiteAuthorizationGuard` falha
 * fechado sem `@MinRole` — decisão explícita da AUTH-009, pra que esquecer
 * o decorator numa rota nova nunca libere acesso por acidente.
 */
export const MinRole = (minimum: Role) =>
  SetMetadata(MIN_ROLE_METADATA_KEY, minimum);
