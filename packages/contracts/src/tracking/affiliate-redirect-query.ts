import { z } from 'zod';

/**
 * Query string de `GET /r/:siteSlug/:offerId` (TRK-002; Architecture.md,
 * Seção 20: "query opcional: articleId, utm_source, utm_medium,
 * utm_campaign").
 *
 * `articleId?`: mesmo padrão de todo filtro opcional por ID já usado no
 * projeto (ex.: `categoryId?` em `listProductsQuerySchema`) —
 * `z.string().uuid().optional()`.
 *
 * `utm_source`/`utm_medium`/`utm_campaign`: nomes em snake_case, não
 * `camelCase` como o resto do projeto (inclusive os campos
 * `utmSource`/`utmMedium`/`utmCampaign` do próprio `AffiliateClick` no
 * schema Prisma) — deliberado, não inconsistência. `ZodValidationPipe`
 * (INF-003) valida o objeto de query cru, sem remapear chaves, e estes são
 * os nomes literais que chegam na URL (convenção universal de UTM,
 * Architecture.md). A tradução para os campos `camelCase` do domínio é
 * responsabilidade do caso de uso que persistir o clique (`TRK-004`, ainda
 * não implementado) — este contrato só define a forma do payload de
 * entrada, nunca a regra de negócio (Architecture.md, Seção 28).
 *
 * `z.string().optional()`, sem `trim()`/`min(1)`/limite de tamanho — nenhuma
 * dessas regras está documentada em Architecture.md ou
 * Implementation-Backlog.md para este campo; tratados como telemetria não
 * confiável (Architecture.md, Seção 20), não como dado validado.
 */
export const affiliateRedirectQuerySchema = z.object({
  articleId: z.string().uuid().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
});

export type AffiliateRedirectQuery = z.infer<typeof affiliateRedirectQuerySchema>;
