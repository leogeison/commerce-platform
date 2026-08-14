import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getPublicArticle } from '@/lib/public-api/client';
import { env } from '@/lib/env';
import { compileArticleBody } from './compile-article-body';

/**
 * Sem `generateStaticParams`, esta rota dinâmica já não tenta buscar dados
 * durante `next build` — mesmo raciocínio da Home/Categoria. `fetchCache =
 * 'force-cache'` reaproveita o `fetch()` de `getPublicArticle` via Data
 * Cache por `articleSlug`, em vez de refazer a cada visitante.
 */
export const fetchCache = 'force-cache';

interface ArticlePageProps {
  params: Promise<{ categorySlug: string; articleSlug: string }>;
}

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
 */
function affiliateRedirectHref(offerId: string, articleId: string): string {
  const url = new URL(`/r/${env.SITE_SLUG}/${offerId}`, env.AFFILIATE_REDIRECT_URL);
  url.searchParams.set('articleId', articleId);
  return url.toString();
}

/**
 * `getPublicArticle(articleSlug)` aqui é o mesmo `fetch()` chamado pelo
 * componente da página — o Next deduplica automaticamente `fetch()`
 * idênticos dentro do mesmo request (memoização de requisição), então isso
 * não é uma segunda chamada real à API. `description` só entra no retorno
 * quando `article.metaDescription` está preenchida: omitir a chave (em vez
 * de mandar `description: undefined`) deixa o merge raso de metadata do
 * Next herdar o `description` estático do `layout.tsx` nesse caso.
 */
export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { articleSlug } = await params;
  const article = await getPublicArticle(articleSlug);

  if (!article) {
    notFound();
  }

  return {
    title: `${article.title} | FastCompre`,
    ...(article.metaDescription ? { description: article.metaDescription } : {}),
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { categorySlug, articleSlug } = await params;

  const article = await getPublicArticle(articleSlug);

  if (!article) {
    notFound();
  }

  // URL canônica de Artigo é `/:categorySlug/:articleSlug` (Architecture.md
  // §33) — `Article.categoryId` pode mudar depois da publicação, então a
  // URL recebida pode divergir da categoria real sem o Artigo deixar de
  // existir. `permanentRedirect()` (App Router) emite 308, não 301: é o
  // mecanismo nativo de redirect permanente do Next.js e preserva a
  // intenção arquitetural (autoridade de SEO) sem precisar de
  // Middleware/Proxy só para forçar o código 301 literal.
  if (article.categorySlug !== categorySlug) {
    permanentRedirect(`/${article.categorySlug}/${articleSlug}`);
  }

  // `bodyMdx` é tratado como Markdown restrito (ver compile-article-body.ts)
  // — `h1` remapeado para `h2` porque o H1 canônico da página já é o título
  // do Artigo (Architecture.md §33: um H1 por página).
  const MDXContent = await compileArticleBody(article.bodyMdx);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{article.title}</h1>

      <p className="mt-2 text-sm text-neutral-500">
        Este artigo contém links de afiliados. Podemos ganhar uma comissão sobre compras
        qualificadas, sem custo adicional para você.
      </p>

      <time dateTime={article.publishedAt} className="mt-1 block text-xs text-neutral-400">
        {new Date(article.publishedAt).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })}
      </time>

      <div className="mt-8">
        <MDXContent components={{ h1: 'h2' }} />
      </div>

      {article.products.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold">Produtos</h2>
          <ul className="mt-4 flex flex-col gap-6">
            {article.products.map((product) => {
              // Ofertas arquivadas já vêm excluídas pela API pública — o único
              // sinal que resta ao frontend é `inStock`. Nenhuma Oferta em
              // estoque cobre tanto `offers: []` quanto "todas presentes, mas
              // fora de estoque" (Architecture.md §12). O aviso no nível do
              // Produto não substitui a lista de Ofertas — só some quando não
              // há nenhuma Oferta pública para mostrar.
              const hasOffers = product.offers.length > 0;
              const isUnavailable = product.offers.every((offer) => !offer.inStock);

              return (
                <li key={product.id} className="flex gap-4">
                  {product.imageUrl && (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      width={96}
                      height={96}
                      loading="lazy"
                      className="aspect-square w-24 shrink-0 rounded object-cover"
                    />
                  )}
                  <div>
                    <h3 className="font-medium">{product.name}</h3>
                    {product.description && (
                      <p className="text-sm text-neutral-500">{product.description}</p>
                    )}
                    {isUnavailable && (
                      <p className="mt-1 text-sm text-neutral-500">Temporariamente indisponível</p>
                    )}
                    {hasOffers && (
                      <ul className="mt-1 flex flex-col gap-1">
                        {product.offers.map((offer) =>
                          offer.inStock ? (
                            <li key={offer.id} className="text-sm text-neutral-500">
                              <a
                                href={affiliateRedirectHref(offer.id, article.id)}
                                target="_blank"
                                rel="sponsored nofollow noopener noreferrer"
                              >
                                {offer.marketplace} — {offer.price} {offer.currency}
                              </a>
                            </li>
                          ) : (
                            <li key={offer.id} className="text-sm text-neutral-500">
                              {offer.marketplace} — {offer.price} {offer.currency} (indisponível)
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
