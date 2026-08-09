import { z } from 'zod';
import { publicArticleProductSchema } from './public-article-product.js';
import { publicArticleSummarySchema } from './public-article-summary.js';

/**
 * Corpo de resposta de `GET /public/sites/:siteSlug/articles/:slug`
 * (PUB-003) — estende `publicArticleSummarySchema` com `bodyMdx` (corpo
 * completo, só faz sentido no detalhe) e `products` (Produtos vinculados +
 * Ofertas públicas, decisão explícita da PUB-001 — ver
 * `public-article-product.ts`).
 */
export const publicArticleSchema = publicArticleSummarySchema.extend({
  bodyMdx: z.string(),
  products: z.array(publicArticleProductSchema),
});

export type PublicArticle = z.infer<typeof publicArticleSchema>;
