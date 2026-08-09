import { z } from 'zod';
import { publicOfferSchema } from './public-offer.js';

/**
 * Um Produto vinculado ao detalhe público de um Artigo (PUB-001/CTR-010) —
 * combina os campos públicos de `Product` com `position` (de
 * `ArticleProduct`, ordena a exibição dentro do Artigo) e as Ofertas
 * vinculadas (`publicOfferSchema`).
 *
 * Decisão explícita da PUB-001: não existe outro endpoint público de
 * Produto/Oferta no backlog, e `WEB-009` (Fase 12) precisa desses dados
 * para montar os links `/r/:siteSlug/:offerId` na página do Artigo — por
 * isso o read model público é `Article → products[] → offers[]`, embutido
 * aqui, em vez de um endpoint próprio.
 *
 * Sem `slug`: não existe página pública própria de Produto no backlog
 * (`WEB-002`/`003`/`004` só cobrem Home, Categoria e Artigo) — não
 * adicionado enquanto não houver consumidor público documentado.
 *
 * `description`/`imageUrl` nuláveis — reflete o schema Prisma
 * (`Product.description`/`imageUrl` são `String?`), mesmo critério do
 * `productAdminSchema`. `imageUrl` só `z.string().min(1)`, sem `.url()`,
 * mesmo critério já usado em toda URL de imagem do projeto.
 */
export const publicArticleProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  imageUrl: z.string().min(1).nullable(),
  position: z.number().int(),
  offers: z.array(publicOfferSchema),
});

export type PublicArticleProduct = z.infer<typeof publicArticleProductSchema>;
