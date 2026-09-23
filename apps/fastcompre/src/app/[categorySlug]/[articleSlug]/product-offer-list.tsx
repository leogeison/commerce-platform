import { affiliateRedirectHref } from './affiliate-redirect-href';
import type { PublicOffer } from '@commerce-platform/contracts';

/**
 * apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-offer-list.tsx
 *
 * UXW-011 — extração local (`apps/fastcompre`, nunca `packages/ui`: conhece
 * `Oferta`/`marketplace`/tracking, fronteira já fechada do projeto) da lista
 * de Ofertas de um Produto, reutilizada por dois consumidores reais e
 * concorrentes na mesma página a partir desta tarefa: `ProductBlockFound`
 * (bloco inline, `product-block.tsx`) e a seção estática de Produtos
 * (`page.tsx`). Antes desta tarefa a mesma lógica existia duplicada, byte a
 * byte, só na seção estática. Não é abstração especulativa — os dois
 * consumidores já existem, hoje, na mesma renderização.
 *
 * Regra de negócio preservada exatamente como já era (Architecture.md §12):
 * cada Oferta em estoque vira um CTA real e independente (nenhuma "melhor
 * Oferta" escolhida por posição/preço); cada Oferta fora de estoque
 * permanece visível como texto, nunca como link. CTA reproduz exatamente
 * `GET /r/:siteSlug/:offerId?articleId=...` via `affiliateRedirectHref`
 * (mesma função já usada por `page.tsx`/`article-json-ld.ts`) — sem novo
 * fetch, endpoint, query param, ou exposição de `affiliateUrl` (campo que
 * nem existe em `PublicOffer`).
 *
 * Linguagem visual/acessível idêntica à já aprovada na UXW-009: mesmas
 * classes de botão (`rounded-control`/`bg-accent`/tokens de foco), mesmo
 * `target="_blank"` + `rel="sponsored nofollow noopener noreferrer"`, mesmo
 * nome acessível com `sr-only` indicando nova aba. `text-fg-muted` (não
 * `text-neutral-500`, usado antes só na seção estática) para a Oferta
 * indisponível — token semântico já validado (`site-footer.tsx`,
 * `--color-neutral-600` é o piso de contraste, `neutral-500` fica abaixo de
 * 4.5:1); consequência aceita desta extração, não uma correção
 * oportunista de código não tocado por esta tarefa.
 */

export interface ProductOfferListProps {
  offers: PublicOffer[];
  articleId: string;
}

export function ProductOfferList({ offers, articleId }: ProductOfferListProps) {
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {offers.map((offer) =>
        offer.inStock ? (
          <li key={offer.id} className="text-body-sm">
            <a
              href={affiliateRedirectHref(offer.id, articleId)}
              target="_blank"
              rel="sponsored nofollow noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-control bg-accent px-control-x py-control-y font-ui font-action text-body text-fg-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 ring-focus"
            >
              {offer.marketplace} — {offer.price} {offer.currency}
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          </li>
        ) : (
          <li key={offer.id} className="text-body-sm text-fg-muted">
            {offer.marketplace} — {offer.price} {offer.currency} (indisponível)
          </li>
        ),
      )}
    </ul>
  );
}
