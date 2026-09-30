import { affiliateRedirectHref } from './affiliate-redirect-href';
import type { Marketplace, PublicOffer } from '@commerce-platform/contracts';

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
 *
 * Refinamento visual pós-`testeLayout.png` (decisão final do PO) — texto de
 * cada Oferta deixa de expor o valor bruto do backend
 * (`{offer.marketplace} — {offer.price} {offer.currency}`, ex.
 * "AMAZON_BR — 220.00 BRL") e passa a exibir um rótulo/preço formatado
 * PURAMENTE de apresentação (ver `formatMarketplaceLabel`/
 * `formatOfferPrice` abaixo). O valor usado no link (`offer.id`, via
 * `affiliateRedirectHref`) e o valor de `offer.marketplace`/`offer.price`/
 * `offer.currency` em si nunca são alterados, comparados de outra forma ou
 * reenviados — só o TEXTO exibido muda. Nenhuma alteração em
 * `packages/contracts`/`apps/api`/persistência.
 */

/**
 * Rótulo de exibição de cada `Marketplace` — lido diretamente do enum real
 * (`packages/contracts/src/common/marketplace.ts`, `marketplaceSchema`,
 * schema Prisma `enum Marketplace`): os 4 valores atualmente suportados,
 * um a um, nenhum inventado e nenhuma antecipação de marketplace futuro
 * ainda não existente no contrato. `Record<Marketplace, string>` — se um
 * 5º valor for adicionado ao enum no futuro, o TypeScript recusa compilar
 * este arquivo até o rótulo ser adicionado aqui também; essa é a única
 * forma de "antecipação" envolvida, e é uma checagem de compilação, não um
 * comportamento de runtime especulativo.
 */
const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  MERCADO_LIVRE: 'Mercado Livre',
  AMAZON_BR: 'Amazon',
  AMAZON_INTL: 'Amazon (internacional)',
  ALIEXPRESS: 'AliExpress',
};

/**
 * Fallback defensivo de RUNTIME (independente da checagem de compilação
 * acima): `publicOfferSchema.marketplace` já valida contra o enum antes de
 * a Oferta pública chegar até aqui, então um valor fora do mapa não deveria
 * acontecer — mas nenhuma suposição de runtime é assumida. Um valor
 * desconhecido exibe a si mesmo (o valor bruto), nunca quebra a
 * renderização da Oferta nem a esconde.
 */
function formatMarketplaceLabel(marketplace: Marketplace): string {
  return MARKETPLACE_LABELS[marketplace] ?? marketplace;
}

/**
 * Preço formatado para exibição. `offer.price` é `z.string()` no contrato
 * público (nunca `number` — `Offer.price` é `Decimal` no Postgres, e uma
 * conversão direta para `number` arriscaria perda de precisão monetária,
 * decisão já registrada em `public-offer.ts`) — a conversão para `number`
 * feita aqui é só para formatação de EXIBIÇÃO; o valor usado em qualquer
 * outro lugar (armazenamento, comparação, link) continua sendo a string
 * original, intocada.
 *
 * `currency` NÃO é tratado como fixo em `BRL`: no contrato público
 * (`public-offer.ts`) é `z.string().min(1)`, e no schema Prisma
 * (`apps/api/prisma/schema.prisma`) é `String @default("BRL")` — um
 * default, não uma restrição; `Marketplace.AMAZON_INTL` já sugere que uma
 * Oferta real pode legitimamente vir em outra moeda. Por isso
 * `Intl.NumberFormat` usa `offer.currency` dinamicamente, nunca `'BRL'`
 * fixo no código.
 *
 * Fallback: `offer.price` pode não ser um número válido, ou `offer.currency`
 * pode não ser um código ISO 4217 reconhecido por `Intl.NumberFormat`
 * (`RangeError`) — ambos tecnicamente possíveis, já que o contrato público
 * não valida nenhum dos dois além de "string não vazia". Em qualquer um
 * desses casos, a formatação cai de volta para o texto bruto
 * (`price currency`) em vez de quebrar a renderização da Oferta — mesmo
 * critério de segurança do rótulo de marketplace acima.
 */
function formatOfferPrice(offer: PublicOffer): string {
  const amount = Number(offer.price);

  if (Number.isNaN(amount)) {
    return `${offer.price} ${offer.currency}`;
  }

  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: offer.currency,
    }).format(amount);
  } catch {
    return `${offer.price} ${offer.currency}`;
  }
}

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
              {formatMarketplaceLabel(offer.marketplace)} — {formatOfferPrice(offer)}
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          </li>
        ) : (
          <li key={offer.id} className="text-body-sm text-fg-muted">
            {formatMarketplaceLabel(offer.marketplace)} — {formatOfferPrice(offer)} (indisponível)
          </li>
        ),
      )}
    </ul>
  );
}
