import type { Role } from '@commerce-platform/contracts';

/**
 * Hierarquia explícita de Role (AUTH-009; Architecture.md, Seção 16:
 * "Regra geral de Role: VIEWER lê; EDITOR cria/edita; OWNER também arquiva/
 * exclui"). Mapa explícito, não a ordem de declaração de nenhum enum nem
 * comparação de string — a ordem de campos de um enum não é uma API
 * estável nem comunica hierarquia por si só.
 *
 * `Role` vem de `@commerce-platform/contracts`, não do enum gerado pelo
 * Prisma: a política de autorização multi-tenant não deve depender do
 * código gerado pelo ORM (decisão explícita da AUTH-009). Os dois tipos são
 * estruturalmente idênticos (`'OWNER' | 'EDITOR' | 'VIEWER'`), então um
 * valor de `SiteUser.role` (Prisma) continua atribuível aqui sem cast.
 */
const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  EDITOR: 1,
  OWNER: 2,
};

/**
 * `actual` satisfaz `minimum` se seu posto na hierarquia for igual ou
 * maior — ex.: `OWNER` sempre satisfaz um mínimo de `EDITOR`, mas `VIEWER`
 * nunca satisfaz.
 */
export function roleMeetsMinimum(actual: Role, minimum: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum];
}
