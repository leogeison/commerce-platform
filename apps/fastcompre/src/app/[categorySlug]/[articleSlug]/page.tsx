import type { ComponentPropsWithoutRef } from 'react';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getPublicArticle } from '@/lib/public-api/client';
import { compileArticleBody } from './compile-article-body';
import { affiliateRedirectHref } from './affiliate-redirect-href';
import { ArticleJsonLd } from './article-json-ld';

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
 * UXW-009 — mescla previsível de `className`: todo renderer abaixo
 * desestrutura `className` das props ANTES de espalhar o resto (`...rest`),
 * então `...rest` nunca pode conter `className` — a classe obrigatória do
 * renderer nunca é sobrescrita silenciosamente por spread. Quando o
 * elemento realmente recebe uma `className` externa (hoje nenhum produtor
 * de `bodyMdx` manda uma, mas o helper cobre o caso), ela é concatenada
 * depois da nossa, nunca substitui.
 */
function mergeClassName(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

/**
 * Renderer único compartilhado por `h1` (heading do `bodyMdx` remapeado —
 * o H1 canônico da página já é `article.title`, Architecture.md §33: um H1
 * por página) e `h2` nativo do `bodyMdx`. Usar o MESMO componente para as
 * duas chaves do mapa `components` é o que garante, estruturalmente, que
 * um H1 persistido no conteúdo e um H2 escrito diretamente no Markdown
 * produzem exatamente o mesmo HTML (`<h2>` com a mesma classe) — não duas
 * implementações que podem divergir com o tempo.
 */
function H2({ className, ...rest }: ComponentPropsWithoutRef<'h2'>) {
  return <h2 className={mergeClassName('mt-10 text-2xl font-semibold text-fg', className)} {...rest} />;
}

function H3({ className, ...rest }: ComponentPropsWithoutRef<'h3'>) {
  return <h3 className={mergeClassName('mt-8 text-xl font-semibold text-fg', className)} {...rest} />;
}

function H4({ className, ...rest }: ComponentPropsWithoutRef<'h4'>) {
  return <h4 className={mergeClassName('mt-6 text-lg font-semibold text-fg', className)} {...rest} />;
}

function H5({ className, ...rest }: ComponentPropsWithoutRef<'h5'>) {
  return <h5 className={mergeClassName('mt-6 text-base font-semibold text-fg', className)} {...rest} />;
}

/**
 * H6 — último nível da escala editorial (H2→H6). Tratamento de rótulo
 * (`uppercase`/`tracking-wide`/`text-fg-muted`) em vez de só encolher o
 * tamanho de novo — nível mais baixo da hierarquia, mesma disciplina de
 * peso semântico decrescente já usada em outras escalas do projeto.
 */
function H6({ className, ...rest }: ComponentPropsWithoutRef<'h6'>) {
  return (
    <h6
      className={mergeClassName(
        'mt-6 text-body-sm font-semibold uppercase tracking-wide text-fg-muted',
        className,
      )}
      {...rest}
    />
  );
}

function P({ className, ...rest }: ComponentPropsWithoutRef<'p'>) {
  return <p className={mergeClassName('mt-4 text-body leading-relaxed', className)} {...rest} />;
}

function Ul({ className, ...rest }: ComponentPropsWithoutRef<'ul'>) {
  return <ul className={mergeClassName('mt-4 list-disc space-y-2 pl-6', className)} {...rest} />;
}

function Ol({ className, ...rest }: ComponentPropsWithoutRef<'ol'>) {
  return <ol className={mergeClassName('mt-4 list-decimal space-y-2 pl-6', className)} {...rest} />;
}

function Li({ className, ...rest }: ComponentPropsWithoutRef<'li'>) {
  return <li className={mergeClassName('text-body', className)} {...rest} />;
}

/**
 * Link inline do corpo — continua herdando `font-editorial` (Source
 * Serif 4) do container ao redor (decisão fechada: link inline do
 * `bodyMdx` não sai da região editorial); diferenciado só por cor/
 * sublinhado/hover/foco, nunca por família tipográfica.
 */
function A({ className, ...rest }: ComponentPropsWithoutRef<'a'>) {
  return (
    <a
      className={mergeClassName(
        'text-accent underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 ring-focus',
        className,
      )}
      {...rest}
    />
  );
}

function Blockquote({ className, ...rest }: ComponentPropsWithoutRef<'blockquote'>) {
  return (
    <blockquote
      className={mergeClassName('mt-6 border-l-2 border-outline pl-4 text-fg-secondary', className)}
      {...rest}
    />
  );
}

/**
 * `h1: H2` é o remapeamento normativo (Architecture.md §33) — nunca a
 * string `'h2'` sozinha: usar o MESMO componente de `h2` garante que o
 * resultado visual é idêntico, por construção, não por manutenção manual
 * de duas classes paralelas. `h5`/`h6` explícitos para completar a escala
 * H2–H6 (UXW-009) — sem isso cairiam no estilo default do navegador.
 * `strong`/`em`/`code`/`pre` deliberadamente sem mapeamento nesta tarefa
 * (decisão explícita: sem necessidade concreta registrada) — herdam
 * `font-editorial` do container, sem estilo adicional.
 */
const mdxComponents = {
  h1: H2,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H5,
  h6: H6,
  p: P,
  ul: Ul,
  ol: Ol,
  li: Li,
  a: A,
  blockquote: Blockquote,
};

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
  // do Artigo (Architecture.md §33: um H1 por página). UXW-009: renderer
  // compartilhado com o `h2` nativo (ver `H2` acima), não uma string solta
  // nem um segundo componente paralelo.
  const MDXContent = await compileArticleBody(article.bodyMdx);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      {/* JSON-LD estrutural (Architecture.md §29/§33; UXW-005A) — derivado
          inteiramente de `article`, nunca persistido. Ver
          `article-json-ld.ts` para o racional completo. Intocado por
          UXW-009. */}
      <ArticleJsonLd article={article} />

      {/* UXW-009 — Source Serif 4 (`font-editorial`, alias novo de
          `packages/ui/tokens/tailwind-theme.css` para o token já existente
          `--font-family-serif`, já carregado de verdade desde UXF-001A) no
          H1 e em toda a região editorial abaixo. Disclosure/data/CTA/seção
          comercial permanecem em Geist Sans (`font-ui`/padrão herdado). */}
      <h1 className="font-editorial text-4xl font-semibold text-fg">{article.title}</h1>

      <p className="mt-4 font-ui text-body text-fg-muted">
        Este artigo contém links de afiliados. Podemos ganhar uma comissão sobre compras
        qualificadas, sem custo adicional para você.
      </p>

      <time dateTime={article.publishedAt} className="mt-1 block font-ui text-body-sm text-fg-muted">
        {new Date(article.publishedAt).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })}
      </time>

      {/* `font-editorial` aplicado uma única vez aqui — herdado por todo
          filho (h2–h6, p, ul/ol/li, blockquote, a inclusive) via cascata
          normal de `font-family`; nenhuma exceção de fonte para o link
          inline (decisão fechada desta tarefa). */}
      <div className="mt-10 font-editorial text-fg">
        <MDXContent components={mdxComponents} />
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
                              {/* UXW-009 — mesmo `href`/`affiliateRedirectHref`/
                                  `target`/`rel` de antes (comportamento de
                                  tracking intocado); só ganha peso visual real
                                  (tokens do `Button` variant `primary`,
                                  reproduzidos aqui em vez de reusar o
                                  componente porque este é um `<a>`, não um
                                  `<button>`) e o `sr-only` de nova aba. */}
                              <a
                                href={affiliateRedirectHref(offer.id, article.id)}
                                target="_blank"
                                rel="sponsored nofollow noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-control bg-accent px-control-x py-control-y font-ui font-action text-body text-fg-on-accent hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 ring-focus"
                              >
                                {offer.marketplace} — {offer.price} {offer.currency}
                                <span className="sr-only"> (abre em nova aba)</span>
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
