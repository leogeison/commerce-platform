import { z } from 'zod';
import { articleAdminSchema } from './article.js';

/**
 * Corpo de cada item de `GET /admin/sites/:siteSlug/articles` (`EDT-007`)
 * — `articleAdminSchema` **sem** `bodyMdx`, decisão explícita desta tarefa
 * (CTR-007): diferente de todo campo de texto já exposto no projeto
 * (`description` de Produto, `bio` de Author), `bodyMdx` é o corpo
 * completo do Artigo em MDX — pode ser um blob de texto grande, sem
 * função nenhuma numa listagem paginada que só mostra metadados
 * (Architecture.md §32: listagem de Artigos filtra por status/tipo, nunca
 * mostra corpo). O detalhe (`EDT-008`) continua usando `articleAdminSchema`
 * completo, com `bodyMdx`.
 *
 * Padrão inverso do usado em Produto (`productDetailAdminSchema` *estende*
 * `productAdminSchema` com mais dado no detalhe) — aqui é a listagem que
 * *omite* um campo do formato completo, não o detalhe que adiciona.
 */
export const articleSummaryAdminSchema = articleAdminSchema.omit({ bodyMdx: true });

export type ArticleSummaryAdmin = z.infer<typeof articleSummaryAdminSchema>;
