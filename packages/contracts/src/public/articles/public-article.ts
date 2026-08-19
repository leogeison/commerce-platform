import { z } from 'zod';
import { publicArticleAuthorSchema } from './public-article-author.js';
import { publicArticleProductSchema } from './public-article-product.js';
import { publicArticleSummarySchema } from './public-article-summary.js';

/**
 * Corpo de resposta de `GET /public/sites/:siteSlug/articles/:slug`
 * (PUB-003) — estende `publicArticleSummarySchema` com `bodyMdx` (corpo
 * completo, só faz sentido no detalhe), `products` (Produtos vinculados +
 * Ofertas públicas, decisão explícita da PUB-001 — ver
 * `public-article-product.ts`) e `author` (Autor vinculado, UXF-011 — ver
 * `public-article-author.ts`).
 *
 * `author` nulável, mas **não opcional**: mesmo critério de
 * `metaDescription`/`coverImageUrl` em `publicArticleSummarySchema` — a
 * chave sempre está presente na resposta; o Artigo simplesmente não tem
 * Autor vinculado (`Article.authorId` é opcional no schema Prisma).
 */
export const publicArticleSchema = publicArticleSummarySchema.extend({
  bodyMdx: z.string(),
  products: z.array(publicArticleProductSchema),
  author: publicArticleAuthorSchema.nullable(),
});

export type PublicArticle = z.infer<typeof publicArticleSchema>;
