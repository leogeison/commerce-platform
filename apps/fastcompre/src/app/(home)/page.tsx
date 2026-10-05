import Image from 'next/image';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { listPublicArticles } from '@/lib/public-api/client';
import { ARTICLE_CARD_IMAGE_SIZES } from '../article-card-image-sizes';
import { Pagination } from '../pagination';
import { resolvePageParam } from '../pagination-window';

/**
 * `connection()` adia a renderização para o momento da requisição, então
 * `next build` não precisa da API viva. `fetchCache = 'force-cache'` faz o
 * `fetch()` de `listPublicArticles` ser reaproveitado via Data Cache em vez
 * de ser refeito a cada visitante.
 */
export const fetchCache = 'force-cache';

/**
 * `sizes` do hero editorial (`items[0]`, fora do grid dos artigos
 * restantes). RECALIBRADO na correção final de composição (decisão
 * fechada do PO, pós-`testeLayout.png`): o hero deixou de ser sempre
 * largura cheia do container — a partir de `md:` ele passa a ser uma
 * composição em duas zonas lado a lado (imagem + texto, ver JSX abaixo),
 * com a imagem ocupando `md:w-3/5` (60%) do container, não mais 100%.
 * Constante local, deliberadamente independente de `ARTICLE_CARD_IMAGE_SIZES`
 * (que descreve uma COLUNA do grid dos artigos restantes) e de
 * `ARTICLE_HERO_IMAGE_SIZES` (Artigo, container e proporção diferentes) —
 * mesmo critério de separação de sempre.
 *
 * Derivação: `<main className="mx-auto max-w-6xl px-4 ...">`. `max-w-6xl`
 * = 1152px; `px-4` = 32px de padding total → área de conteúdo de até
 * 1120px a partir de 1152px de viewport; abaixo disso, acompanha a
 * viewport (`100vw - 32px`).
 *
 * Abaixo de `md:` (768px) o hero continua empilhado (`flex-col`, mobile-
 * first) — a imagem é `w-full`, então a largura relevante é a do
 * container inteiro (`calc(100vw - 32px)`), igual a todo o resto do site.
 *
 * A partir de `md:`, a imagem é `md:w-3/5` do container. Como o teto do
 * container (1152px) fica ACIMA do breakpoint `md:` (768px) — diferente
 * do container antigo, cujo teto coincidia com `md:` —, a largura real da
 * imagem ainda CRESCE de 768px até 1152px de viewport antes de travar. Em
 * vez de uma fórmula em `vw` (sem precedente nas constantes deste app),
 * usa-se o valor mais largo que a imagem pode assumir nessa faixa inteira
 * — que ocorre exatamente no teto do container: conteúdo travado em
 * 1120px; imagem = 1120 × 0,6 = 672px. Usar 672px fixo para toda a faixa
 * `md:`+ superestima a largura real perto de 768px (onde a imagem real é
 * só ≈442px) — nunca um problema: o navegador reserva banda um pouco
 * maior que o necessário, nunca menos (mesmo critério de "nunca descrever
 * uma área menor que a real" já usado em `article-card-image-sizes.ts`).
 */
const HOME_HERO_IMAGE_SIZES = '(min-width: 768px) 672px, calc(100vw - 32px)';

interface HomeProps {
  searchParams?: Promise<{ page?: string | string[] }>;
}

/**
 * Refinamento visual pré-UXW-015 (desenho técnico aprovado pelo Product
 * Owner, referência visual `testeLayout.png` — ver `docs/UXW-visual-
 * direction-decision.md`) — formata `publishedAt` uma única vez, já que
 * agora é usado em dois lugares deste arquivo (hero + cards da listagem).
 * Extração local, dentro do próprio arquivo — não é a mesma decisão já
 * registrada de não promover um `Container`/card compartilhado entre Home
 * e Categoria (isso continua intocado); é só DRY dentro de um único
 * arquivo, sem cruzar fronteira nenhuma.
 */
function formatPublishedAt(publishedAt: string): string {
  return new Date(publishedAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * UXW-012 — leitura de `page` via querystring (`?page=N`), decisão fechada
 * do desenho técnico aprovado. `resolvePageParam` (`../pagination.tsx`)
 * valida o formato ANTES de chamar a API pública: qualquer valor que não
 * seja um inteiro positivo estrito (ausência → 1; `0`, negativo, decimal,
 * texto ou valores repetidos, que chegam como array) resulta em
 * `notFound()` imediato, sem gastar uma chamada à API — mesmo critério já
 * usado por `[categorySlug]/page.tsx` para categoria inexistente.
 *
 * Depois da resposta real da API, uma segunda checagem cobre página fora
 * do range: `page > totalPages` também é `notFound()` — exceto o caso
 * legítimo de `page === 1` com `totalPages === 0` (nenhum artigo
 * publicado ainda), que continua sendo o estado vazio já existente, não
 * um erro. Nenhuma dessas duas regras altera `packages/contracts` ou
 * `apps/api` — são decisões de apresentação/SEO desta própria tarefa,
 * aplicadas só aqui.
 *
 * `searchParams` é opcional (com default `{}`) só para preservar a
 * assinatura já usada por `shell.integration.spec.tsx` (`await Home()`,
 * sem argumento nenhum). O Next.js real sempre invoca a página com
 * `searchParams` de verdade — a opcionalidade só existe para o teste de
 * integração pré-existente continuar compilando e passando sem alteração.
 */
export default async function Home({ searchParams }: HomeProps = {}) {
  await connection();

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const page = resolvePageParam(resolvedSearchParams.page);
  if (page === null) {
    notFound();
  }

  const { items, totalPages } = await listPublicArticles({ page });

  if (page > 1 && page > totalPages) {
    notFound();
  }

  // Correção de LCP (UXW-006) — preservada integralmente pelo refinamento
  // visual pré-UXW-015: o candidato a `preload` continua sendo a primeira
  // imagem REAL da listagem (`findIndex` sobre `items`, não sobre a lista
  // renderizada depois do hero ser destacado) — decisão fechada do desenho
  // aprovado ("candidato a preload continua sendo a primeira imagem real
  // elegível da listagem, mesmo que não pertença ao hero"). Isso
  // desacopla deliberadamente "qual artigo é o hero" (sempre `items[0]`,
  // por posição) de "qual imagem recebe prioridade de carregamento"
  // (sempre a primeira com `coverImageUrl`, seja ela do hero ou de um
  // card abaixo dele). Na prática, `items[0]` só deixa de ser o candidato
  // quando ele mesmo não tem `coverImageUrl` — `findIndex` já cobre esse
  // caso corretamente, nenhuma mudança nesta lógica em si.
  const firstImageIndex = items.findIndex((article) => article.coverImageUrl);

  // Refinamento visual pré-UXW-015 — hero editorial: `items[0]` (já
  // ordenado `publishedAt desc`, nenhuma query/campo novo) ganha destaque
  // visual próprio acima da listagem; os demais artigos (`items.slice(1)`)
  // seguem no mesmo formato de card já existente, só com `font-editorial`
  // adicionado (ver abaixo). Quando há só 1 artigo publicado, não existe
  // grade abaixo do hero — comportamento consequente, não um caso especial
  // tratado à parte.
  const [heroArticle, ...remainingArticles] = items;

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-fg">FastCompre</h1>
      <p className="mt-2 text-body text-fg-muted">
        Comparativos e reviews de produtos para o público brasileiro.
      </p>

      {items.length === 0 ? (
        <p className="mt-12 text-center text-body text-fg-muted">
          Nenhum artigo publicado ainda.
        </p>
      ) : (
        <>
          {/* Hero editorial — `items[0]`. Fallback textual quando
              `coverImageUrl` é `null` (decisão fechada: nunca pular para
              outro artigo, nunca placeholder de imagem falso — mesmo
              critério condicional `{coverImageUrl && (...)}` já usado em
              todo o resto do site). `<h2>`, nunca `<h1>` — a página já tem
              seu único H1 acima (Architecture.md §33); o hero é maior só
              visualmente (classe), nunca por nível semântico de heading,
              mesmo nível dos títulos dos cards abaixo.

              Correção final de composição (decisão fechada do PO, pós-
              `testeLayout.png`) — composição em duas zonas a partir de
              `md:`: o desenho anterior (`flex-col` em toda largura) nunca
              chegou a implementar a composição lado a lado prevista pela
              referência visual; esta rodada corrige isso de fato.
              `<article>` passa a `md:flex-row md:items-start md:gap-8`
              (gap-4 preservado no mobile empilhado; `md:gap-8` — mesmo
              valor já usado como respiro maior em blockquote/H3 do
              Artigo, nenhum token novo). Ordem do DOM = imagem → texto em
              qualquer largura (mesma ordem de sempre, sem CSS `order` em
              lugar nenhum) — no mobile isso empilha imagem acima do
              texto; a partir de `md:`, o mesmo DOM produz imagem à
              esquerda/texto à direita, só pela mudança de eixo do flex.
              Nenhum overlay de texto sobre a fotografia (decisão fechada
              desta rodada — `coverImageUrl` aceita asset arbitrário,
              sem garantia de contraste suficiente para texto por cima). */}
          <a
            href={`/${heroArticle.categorySlug}/${heroArticle.slug}`}
            aria-labelledby={`home-hero-title-${heroArticle.id}`}
            className="group mt-10 flex flex-col gap-4 rounded-control focus-visible:outline-none focus-visible:ring-2 ring-focus"
          >
            <article className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
              {heroArticle.coverImageUrl && (
                // `width`/`height` (768×512, proporção 3:2) — preservada
                // nesta rodada: reavaliada contra a composição em duas
                // zonas, mas sem asset novo/proporção final validada pelo
                // PO para o recorte lado a lado, mantê-la é a opção mais
                // segura (nenhuma proporção nova inventada só por CSS).
                // `md:w-3/5 md:shrink-0` — a imagem passa a ocupar ~60% do
                // container a partir de `md:` (fração padrão do Tailwind,
                // nenhum valor arbitrário); o texto ao lado usa
                // `md:flex-1` para preencher o restante. Abaixo de `md:`
                // continua `w-full` (empilhado, sem mudança).
                // `sizes={HOME_HERO_IMAGE_SIZES}` recalibrado para a nova
                // largura de coluna — ver comentário da constante acima.
                <Image
                  src={heroArticle.coverImageUrl}
                  alt=""
                  width={768}
                  height={512}
                  sizes={HOME_HERO_IMAGE_SIZES}
                  preload={firstImageIndex === 0}
                  className="aspect-[3/2] h-auto w-full shrink-0 rounded-control object-cover md:w-3/5"
                />
              )}
              <div className="md:min-w-0 md:flex-1">
                {/* `text-2xl md:text-3xl` (refinamento mobile, decisão
                    fechada do PO): título do hero menor em mobile — o
                    hero permanece empilhado abaixo de `md:`, então um
                    título `text-3xl` fixo lia como desproporcional numa
                    tela estreita; cresce de volta a `text-3xl` a partir
                    de `md:`, mesmo tamanho de sempre no desktop. */}
                <h2
                  id={`home-hero-title-${heroArticle.id}`}
                  className="font-editorial text-2xl font-semibold text-fg group-hover:text-accent md:text-3xl"
                >
                  {heroArticle.title}
                </h2>
                {heroArticle.metaDescription && (
                  <p className="mt-2 text-body text-fg-secondary">
                    {heroArticle.metaDescription}
                  </p>
                )}
                <time
                  dateTime={heroArticle.publishedAt}
                  className="mt-2 block text-body-sm text-fg-muted"
                >
                  {formatPublishedAt(heroArticle.publishedAt)}
                </time>
              </div>
            </article>
          </a>

          {remainingArticles.length > 0 && (
            // Refinamento visual pós-`testeLayout.png` (decisão final do
            // PO): grid responsivo no lugar da pilha vertical de 1 coluna
            // — `grid-cols-1` (mobile, consequência natural do mobile-
            // first, nenhum comportamento novo) → `md:grid-cols-2` →
            // `lg:grid-cols-3`, breakpoints padrão do Tailwind já em uso
            // real no monorepo (`apps/admin/.../dashboard.tsx`), nenhum
            // valor novo inventado. `<ul>/<li>` preservados, ordem do DOM
            // preservada (mesmo `.map()` de sempre, sem `order` do CSS
            // Grid/Flex em nenhum lugar) — a ordem de leitura por teclado/
            // leitor de tela continua igual à ordem visual, que é a ordem
            // em que a API pública já devolve os artigos (`publishedAt
            // desc`).
            //
            // `gap-6 md:gap-10` (correção final de composição, decisão
            // fechada do PO): em mobile o grid é `grid-cols-1`, então
            // `gap` só produz espaçamento VERTICAL entre cards empilhados
            // — `gap-10` (40px) repetido entre cada card lia como
            // espaçamento vertical excessivo/repetitivo numa tela
            // estreita. `gap-6` (24px) no mobile, crescendo para `gap-10`
            // (40px, valor original, reaproveitado sem mudança) a partir
            // de `md:`, onde o grid deixa de ser uma pilha de 1 coluna —
            // mesma escala Tailwind padrão, nenhum token novo.
            <ul className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10 lg:grid-cols-3">
              {remainingArticles.map((article, index) => {
                // `index` é relativo a `remainingArticles` (que começa no
                // segundo artigo de `items`) — por isso `+ 1` para comparar
                // contra `firstImageIndex`, que é sempre relativo a `items`
                // inteiro (ver comentário acima sobre o candidato a
                // preload continuar calculado sobre a lista completa).
                const isLcpCandidate = index + 1 === firstImageIndex;

                return (
                  <li key={article.id}>
                    <a
                      href={`/${article.categorySlug}/${article.slug}`}
                      aria-labelledby={`home-card-title-${article.id}`}
                      className="group flex flex-col gap-4 rounded-control focus-visible:outline-none focus-visible:ring-2 ring-focus"
                    >
                      <article className="flex flex-col gap-4">
                        {article.coverImageUrl && (
                          <Image
                            src={article.coverImageUrl}
                            alt=""
                            width={640}
                            height={360}
                            sizes={ARTICLE_CARD_IMAGE_SIZES}
                            preload={isLcpCandidate}
                            className="aspect-video h-auto w-full rounded-control object-cover"
                          />
                        )}
                        <div>
                          <h2
                            id={`home-card-title-${article.id}`}
                            className="font-editorial text-xl font-semibold text-fg group-hover:text-accent"
                          >
                            {article.title}
                          </h2>
                          {article.metaDescription && (
                            <p className="mt-2 text-body text-fg-secondary">
                              {article.metaDescription}
                            </p>
                          )}
                          <time
                            dateTime={article.publishedAt}
                            className="mt-2 block text-body-sm text-fg-muted"
                          >
                            {formatPublishedAt(article.publishedAt)}
                          </time>
                        </div>
                      </article>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Pagination currentPage={page} totalPages={totalPages} basePath="/" />
    </main>
  );
}
