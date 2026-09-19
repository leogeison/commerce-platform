import { env } from '@/lib/env';

/**
 * Monta o `href` de `GET /r/:siteSlug/:offerId` (WEB-009; Architecture.md
 * §20 — Fluxo de Tracking). `env.AFFILIATE_REDIRECT_URL` é a origem
 * browser-facing do endpoint de redirect — nunca `env.API_URL`, que é
 * server-only e não tem garantia de ser publicamente acessível
 * (Architecture/Backlog não fecham essa suposição de deploy).
 *
 * `articleId` sempre incluído: a Arquitetura já prevê esse parâmetro para
 * atribuição do clique por Artigo de origem, e esta página sempre conhece o
 * Artigo. Sem UTM — não há fonte/campanha concreta que os justifique nesta
 * tarefa.
 *
 * Nunca recebe/constrói a partir de `affiliateUrl` — esse campo não existe
 * no contrato público (`PublicOffer`); só `offerId`/`articleId`, ambos IDs
 * opacos que a API pública já expõe.
 *
 * Extraída de `page.tsx` (UXW-005A) — lógica e assinatura preservadas
 * integralmente, apenas extração + `export`. Motivo: virar a única fonte de
 * verdade reutilizada tanto pelo link visível de afiliado (`page.tsx`)
 * quanto por `Offer.url` no JSON-LD estrutural (`article-json-ld.ts`), sem
 * duplicar a lógica de montagem da URL e sem criar dependência invertida de
 * `article-json-ld.ts` para `page.tsx`.
 */
export function affiliateRedirectHref(offerId: string, articleId: string): string {
  const url = new URL(`/r/${env.SITE_SLUG}/${offerId}`, env.AFFILIATE_REDIRECT_URL);
  url.searchParams.set('articleId', articleId);
  return url.toString();
}
