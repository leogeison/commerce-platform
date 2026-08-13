import type { Role } from '@commerce-platform/contracts';

/**
 * Hierarquia explícita de Role no frontend (ADM-012) — espelha, de
 * propósito, `apps/api/src/modules/tenancy/domain/role-hierarchy.ts`
 * (mesmo nome de arquivo, mesma tabela de posto, mesma assinatura). Não é
 * uma hierarquia nova: é a mesma decisão já aprovada na AUTH-009
 * (Architecture.md, Seção 16 — "`VIEWER` lê; `EDITOR` cria/edita; `OWNER`
 * também arquiva/exclui") replicada aqui só porque frontend e backend são
 * runtimes separados, sem import compartilhado possível.
 *
 * Esconder um botão com base nisto é puramente UX (ADM-012) — a API
 * continua sendo a única autoridade real via `@MinRole`/`roleMeetsMinimum`
 * no backend; esta função nunca substitui aquela checagem.
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
