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

interface HomeProps {
  searchParams?: Promise<{ page?: string | string[] }>;
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
 * sem argumento nenhum — arquivo fora do escopo/`Arquivos/áreas` desta
 * tarefa, não tocado). O Next.js real sempre invoca a página com
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

  // Correção de LCP (UXW-006 — regressão encontrada no gate contra o budget
  // da UXF-014): a primeira imagem da listagem com `coverImageUrl` é o
  // elemento LCP real desta rota (confirmado pelo relatório Lighthouse —
  // `img.aspect-video`). UXW-013 substitui o `loading="eager"`+
  // `fetchPriority="high"` manuais (Next 16, `next/image`) pelo prop
  // `preload` (ver JSX abaixo) — mesmo racional, mecanismo nativo mais
  // forte (inclui `<link rel="preload">` real no `<head>`). `findIndex` em
  // vez de `index === 0`: nem todo artigo tem `coverImageUrl` (campo
  // opcional), então o candidato a LCP é o primeiro artigo da lista que
  // REALMENTE tem imagem, não necessariamente o primeiro item da lista.
  // Preservado integralmente desde a UXW-006/UXW-007 — só o mecanismo de
  // prioridade muda nesta tarefa, a lógica que decide QUAL imagem recebe
  // prioridade não.
  const firstImageIndex = items.findIndex((article) => article.coverImageUrl);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-fg">FastCompre</h1>
      <p className="mt-2 text-body text-fg-muted">
        Comparativos e reviews de produtos para o público brasileiro.
      </p>

      {items.length === 0 ? (
        <p className="mt-12 text-center text-body text-fg-muted">
          Nenhum artigo publicado ainda.
        </p>
      ) : (
        <ul className="mt-10 flex flex-col gap-10">
          {items.map((article, index) => {
            const isLcpCandidate = index === firstImageIndex;

            return (
              <li key={article.id}>
                <a
                  href={`/${article.categorySlug}/${article.slug}`}
                  className="group flex flex-col gap-4 rounded-control focus-visible:outline-none focus-visible:ring-2 ring-focus"
                >
                  <article className="flex flex-col gap-4">
                    {article.coverImageUrl && (
                      // `alt=""`: o título do artigo já está visível como
                      // texto dentro deste mesmo link (o `<h2>` abaixo) —
                      // um `alt` não vazio aqui duplicaria o título no nome
                      // acessível do link inteiro. `width`/`height`
                      // (640×360, proporção 16:9) são o tamanho intrínseco
                      // real usado para o cálculo de `aspect-ratio`
                      // automático do `next/image` — a exibição real
                      // continua fluida via `w-full aspect-video`
                      // (CSS), exatamente como antes; `sizes`
                      // (`ARTICLE_CARD_IMAGE_SIZES`) é a largura real do
                      // card, derivada do layout (`../article-card-image-
                      // sizes.ts`), não um valor presumido. UXW-013 — Next
                      // 16: `preload` (não `priority`, deprecated) é a API
                      // atual para a primeira imagem elegível a LCP;
                      // nenhum `loading`/`fetchPriority` manual é passado
                      // junto — `next/image` decide os dois a partir de
                      // `preload` sozinho.
                      <Image
                        src={article.coverImageUrl}
                        alt=""
                        width={640}
                        height={360}
                        sizes={ARTICLE_CARD_IMAGE_SIZES}
                        preload={isLcpCandidate}
                        className="aspect-video w-full rounded-control object-cover"
                      />
                    )}
                    <div>
                      <h2 className="text-xl font-semibold text-fg group-hover:text-accent">
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
                        {new Date(article.publishedAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </time>
                    </div>
                  </article>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination currentPage={page} totalPages={totalPages} basePath="/" />
    </main>
  );
}
