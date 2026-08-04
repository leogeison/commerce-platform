import { z } from 'zod';
import { articleAdminSchema, articleParamsSchema } from '../articles/index.js';

/**
 * Superfície `admin/publication` (CTR-008), escopo desta tarefa: só as
 * três transições HTTP-facing da Fase 7 (`EDT-012` `submit-for-review`,
 * `EDT-013` `revert-to-draft`, `EDT-016` `restore-to-draft`).
 *
 * Nenhum schema novo — as três rotas não têm corpo de request (transições
 * incondicionais, dado o status de origem correto, sem payload) e a
 * resposta é o `Article` completo, exatamente como já retornado por
 * `create`/`update`/`detail`. Reexporta com aliases próprios (não
 * `export * from '../articles/index.js'`) para que esta superfície tenha
 * nomes semânticos de "publication" sem duplicar a definição do schema —
 * mesmo objeto Zod, mesmo critério de "um contrato, uma única fonte de
 * verdade" (Architecture.md).
 *
 * `articleParamsSchema` cobre os parâmetros das três rotas (`{siteSlug,
 * id}` — nenhuma tem parâmetro adicional). `articleAdminSchema` cobre a
 * resposta de sucesso das três.
 *
 * Fora do escopo, de propósito: contratos de publicar/arquivar (`REV-003`/
 * `REV-004`, Fase 14, com a lista de pendências de `APP-002`) e de
 * `/health` — entram just-in-time quando essas tarefas forem desenhadas,
 * não antecipados aqui.
 */
export const articleTransitionParamsSchema = articleParamsSchema;
export type ArticleTransitionParams = z.infer<typeof articleTransitionParamsSchema>;

export const articleTransitionResponseSchema = articleAdminSchema;
export type ArticleTransitionResponse = z.infer<typeof articleTransitionResponseSchema>;
