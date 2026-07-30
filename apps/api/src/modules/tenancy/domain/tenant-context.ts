/**
 * Núcleo do `TenantContext` (INF-008; Architecture.md, Seção 18).
 *
 * Deliberadamente independente de framework: nenhum import de `@nestjs/*`,
 * nenhuma leitura de `Request`, nenhum acesso a banco. Este arquivo só
 * define o tipo imutável e a lógica pura de resolução/validação — quem
 * busca `Site`/`SiteUser` no banco (Prisma) e quem lê o `siteSlug`/usuário
 * autenticado da requisição são responsabilidades de outra camada, ainda
 * não implementada (a extração de sessão é Fase 5 — AUTH-005/006; o
 * `CanActivate`/controller que vai chamar estas funções fica para quando
 * essa camada existir).
 *
 * Por isso as funções abaixo recebem os dados **já resolvidos** (o
 * resultado de uma consulta ao `Site`, e — no caminho admin — o resultado
 * de uma consulta ao `SiteUser`) em vez de aceitarem um `siteId`/`userId`
 * "confiado" ou buscarem esses registros sozinhas. Isso é o que impede um
 * `siteId` forjado (ex.: vindo de um body de requisição) de virar
 * `TenantContext`: não existe nenhum parâmetro por onde um valor não
 * validado entra no cálculo — o único jeito de obter um `TenantContext` é
 * apresentar um `ResolvedSite` e (no caminho admin) um `ResolvedSiteMembership`
 * cujo `siteId` realmente bate com o do Site.
 */

/**
 * `TenantContext` — objeto imutável explícito (`{ siteId, siteSlug }`),
 * passado por parâmetro a casos de uso e repositórios; nunca lido de estado
 * global, request-scoped ou `AsyncLocalStorage`.
 */
export interface TenantContext {
  readonly siteId: string;
  readonly siteSlug: string;
}

/** Resultado de uma consulta ao `Site` por `slug`, já realizada por quem chama. */
export interface ResolvedSite {
  readonly id: string;
  readonly slug: string;
}

/**
 * Resultado de uma consulta ao `SiteUser` (associação `User`↔`Site`), já
 * realizada por quem chama. Representa "este usuário tem vínculo ativo com
 * este Site" — a Role em si é autorização (Seção 16), fora do escopo desta
 * tarefa.
 */
export interface ResolvedSiteMembership {
  readonly siteId: string;
  readonly userId: string;
}

export type TenantContextResolutionFailure =
  | { readonly reason: 'SITE_NOT_FOUND' }
  | { readonly reason: 'MEMBERSHIP_NOT_FOUND' };

export type TenantContextResolutionResult =
  | { readonly ok: true; readonly context: TenantContext }
  | { readonly ok: false; readonly failure: TenantContextResolutionFailure };

function createTenantContext(site: ResolvedSite): TenantContext {
  return Object.freeze({ siteId: site.id, siteSlug: site.slug });
}

/**
 * Caminho público (conteúdo) — Seção 17: `apps/fastcompre` envia um
 * `siteSlug` que seleciona conteúdo público; "não é credencial nem prova de
 * autorização". Não há verificação de usuário/membership aqui: só exige que
 * o `Site` exista.
 *
 * `site` é `null` quando a consulta por `slug` (feita por quem chama, fora
 * desta função) não encontrou nenhum `Site` — resultado de falha explícito,
 * nunca uma exceção lançada por esta função.
 */
export function resolvePublicTenantContext(
  site: ResolvedSite | null,
): TenantContextResolutionResult {
  if (!site) {
    return { ok: false, failure: { reason: 'SITE_NOT_FOUND' } };
  }

  return { ok: true, context: createTenantContext(site) };
}

/**
 * Caminho admin — Seção 17: a escolha de "projeto atual" só vira `siteId`
 * efetivo depois que a API confirma um `SiteUser` válido daquele `User`
 * para aquele `Site`. Por isso exige tanto `site` quanto `membership`, e
 * confirma que `membership.siteId === site.id`: um `SiteUser` de outro Site
 * (ex.: o usuário é `OWNER` no Site A e tenta obter contexto do Site B sem
 * ter `SiteUser` lá) é insuficiente — ser dono de um Site não concede
 * acesso a outro (Seção 16).
 *
 * `membership` é `null` quando a consulta (feita por quem chama) não
 * encontrou nenhum `SiteUser` para o par `(userId, site.id)` requisitado.
 */
export function resolveAdminTenantContext(
  site: ResolvedSite | null,
  membership: ResolvedSiteMembership | null,
): TenantContextResolutionResult {
  if (!site) {
    return { ok: false, failure: { reason: 'SITE_NOT_FOUND' } };
  }

  if (!membership || membership.siteId !== site.id) {
    return { ok: false, failure: { reason: 'MEMBERSHIP_NOT_FOUND' } };
  }

  return { ok: true, context: createTenantContext(site) };
}
