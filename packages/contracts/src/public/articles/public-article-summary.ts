import { z } from 'zod';
import { articleTypeSchema } from '../../common/article-type.js';

/**
 * Item de `GET /public/sites/:siteSlug/articles` (PUB-002) — representação
 * pública "rasa" de `Article` (PUB-001/CTR-010). O detalhe (PUB-003) usa
 * `publicArticleSchema`, que estende este schema com `bodyMdx` e
 * `products` — mesmo padrão de composição já usado no admin
 * (`articleSummaryAdminSchema`/`articleAdminSchema`,
 * `productAdminSchema`/`productDetailAdminSchema`).
 *
 * Nunca expõe (Architecture.md, Seção 29: "Contratos públicos nunca
 * expõem campos administrativos ou internos"):
 * - `status` — todo Artigo retornado pela API pública já é implicitamente
 *   `PUBLISHED` (regra de comportamento da PUB-002/003, não desta forma);
 *   expor o enum cru seria redundante e administrativo.
 * - `siteId` — já resolvido via `:siteSlug` na própria rota.
 * - `authorId`/dados de Autor — a listagem continua sem Autor: só o
 *   detalhe (`publicArticleSchema`, UXF-011) inclui `author: { name,
 *   avatarUrl } | null`. Aqui seria informação a mais numa listagem que só
 *   mostra metadados leves (mesmo critério de `bodyMdx`, abaixo).
 * - `createdAt`/`updatedAt` — bookkeeping interno, sem consumidor público
 *   documentado (diferente de `publishedAt`, que é a data relevante para
 *   ordenação da Home, Architecture.md §31).
 * - `bodyMdx` — corpo completo do Artigo, sem função numa listagem que só
 *   mostra metadados (mesmo critério de `articleSummaryAdminSchema`).
 *
 * `categorySlug` sempre presente — Architecture.md §31: "todo endpoint
 * público retorna `categorySlug` junto do artigo", usado pelo
 * `apps/fastcompre` para validar a URL recebida contra a categoria real
 * (§33, URL canônica).
 */
export const publicArticleSummarySchema = z.object({
  id: z.string().uuid(),
  categorySlug: z.string().min(1),
  type: articleTypeSchema,
  title: z.string().min(1),
  slug: z.string().min(1),
  metaDescription: z.string().nullable(),
  coverImageUrl: z.string().min(1).nullable(),
  publishedAt: z.string().datetime(),
});

export type PublicArticleSummary = z.infer<typeof publicArticleSummarySchema>;
