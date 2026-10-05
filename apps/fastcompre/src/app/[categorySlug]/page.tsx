import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getPublicCategory, listPublicArticles } from '@/lib/public-api/client';
import { ARTICLE_CARD_IMAGE_SIZES } from '../article-card-image-sizes';
import { Pagination } from '../pagination';
import { resolvePageParam } from '../pagination-window';

/**
 * Sem `generateStaticParams`, esta rota dinâmica já não tenta buscar dados
 * durante `next build` — diferente da Home, aqui não é preciso `connection()`.
 * `fetchCache = 'force-cache'` faz os `fetch()` desta rota serem
 * reaproveitados via Data Cache por `categorySlug`, em vez de refeitos a cada
 * visitante.
 */
export const fetchCache = 'force-cache';

interface CategoryPageProps {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

/**
 * UXW-012 — mesmo critério de paginação da Home (`../pagination.tsx`),
 * aplicado a esta rota: `page` inválido (formato ou repetido) →
 * `notFound()` antes de qualquer chamada à API; `page` acima de
 * `totalPages` devolvido pela API → `notFound()` também, exceto
 * `page === 1` com `totalPages === 0` (categoria existente sem nenhum
 * artigo publicado — estado vazio legítimo, já existente). A checagem de
 * categoria inexistente (já existente, `if (!category) notFound()`)
 * continua sem alteração, só reordenada para depois da validação de
 * formato de `page` (mais barata, não depende de rede).
 */
export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { categorySlug } = await params;
  const { page: rawPage } = await searchParams;
  const page = resolvePageParam(rawPage);
  if (page === null) {
    notFound();
  }

  const [category, { items, totalPages }] = await Promise.all([
    getPublicCategory(categorySlug),
    listPublicArticles({ categorySlug, page }),
  ]);

  if (!category) {
    notFound();
  }

  if (page > 1 && page > totalPages) {
    notFound();
  }

  // Correção de LCP (UXW-006 — regressão encontrada no gate contra o budget
  // da UXF-014): mesmo racional de `apps/fastcompre/src/app/(home)/page.tsx`
  // (ver comentário lá) — a primeira imagem da listagem com `coverImageUrl` é
  // o elemento LCP real desta rota. UXW-013 substitui o mecanismo manual de
  // prioridade pelo prop `preload` do `next/image` (Next 16) — mesmo
  // racional exato da Home. Duplicado aqui em vez de extraído para um
  // componente compartilhado — esta rota já duplicava o bloco de listagem
  // inteiro da Home antes desta correção, e UXW-008 (redesenho visual
  // desta página) preserva essa mesma decisão: o novo card reproduz
  // localmente a linguagem visual da Home sem promover nenhum componente
  // comum a `packages/ui` nem a um módulo compartilhado dentro de
  // `apps/fastcompre` (`ARTICLE_CARD_IMAGE_SIZES`, abaixo, é a única
  // exceção deliberada — ver `../article-card-image-sizes.ts`: um valor de
  // layout puro, sem conhecimento de domínio, com dois consumidores reais
  // simultâneos nesta própria tarefa). Refinamento visual pré-UXW-015: a
  // Categoria NÃO ganha um hero próprio (decisão fechada do desenho
  // aprovado — só a Home destaca `items[0]`); esta rota segue reproduzindo
  // fielmente o card da Home, agora incluindo `font-editorial` no título e
  // o ajuste `h-auto` (ver JSX abaixo).
  const firstImageIndex = items.findIndex((article) => article.coverImageUrl);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-fg">{category.name}</h1>

      {items.length === 0 ? (
        <p className="mt-12 text-center text-body text-fg-muted">
          Nenhum artigo publicado nesta categoria ainda.
        </p>
      ) : (
        // Refinamento visual pós-`testeLayout.png` (decisão final do PO):
        // mesmo grid responsivo da Home (`grid-cols-1 md:grid-cols-2
        // lg:grid-cols-3`) — Categoria NÃO ganha um hero (decisão fechada,
        // reafirmada nesta rodada: "não transforme Categoria em cópia do
        // hero da Home"), então TODOS os artigos desta rota entram no
        // grid, sem exceção de posição. `<ul>/<li>` preservados, ordem do
        // DOM preservada (sem `order` do CSS Grid/Flex).
        //
        // `gap-6 md:gap-10` (correção final de composição, decisão fechada
        // do PO) — mesmo ajuste de espaçamento mobile aplicado ao grid da
        // Home (ver `(home)/page.tsx`): em `grid-cols-1` o gap só produz
        // espaçamento vertical entre cards empilhados, e `gap-10` (40px)
        // repetido lia como excessivo numa tela estreita.
        <ul className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10 lg:grid-cols-3">
          {items.map((article, index) => {
            const isLcpCandidate = index === firstImageIndex;

            return (
              <li key={article.id}>
                <a
                  href={`/${article.categorySlug}/${article.slug}`}
                  aria-labelledby={`category-card-title-${article.id}`}
                  className="group flex flex-col gap-4 rounded-control focus-visible:outline-none focus-visible:ring-2 ring-focus"
                >
                  <article className="flex flex-col gap-4">
                    {article.coverImageUrl && (
                      // `alt=""`/`width`/`height`/`sizes`: mesmo critério
                      // exato de `apps/fastcompre/src/app/(home)/page.tsx`
                      // (UXW-007/UXW-013). `h-auto` junto de `aspect-video
                      // w-full` (refinamento pré-UXW-015): corrige o
                      // warning de dev do `next/image` sobre width/height
                      // responsivo — `w-full` sobrescreve a largura via
                      // CSS, mas nada declarava `height: auto`
                      // explicitamente (o `aspect-video` do Tailwind define
                      // `aspect-ratio`, que a heurística de dev do Next não
                      // reconhece como equivalente). Não muda nada
                      // visualmente — a caixa já era determinada pelo
                      // `aspect-ratio` — só silencia o aviso. `sizes` vem
                      // de `ARTICLE_CARD_IMAGE_SIZES`, recalibrado para o
                      // grid nesta mesma rodada (ver
                      // `../article-card-image-sizes.ts`).
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
                      {/* `font-editorial` (refinamento pré-UXW-015,
                          decisão fechada do desenho aprovado): título do
                          card passa a usar Source Serif 4, mesma leitura
                          do Princípio Normativo 1 ("Source Serif 4 para
                          conteúdo/títulos editoriais") aplicada de forma
                          consistente à listagem — resumo/data continuam em
                          Geist Sans (`font-ui`, herança padrão). */}
                      <h2
                        id={`category-card-title-${article.id}`}
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

      <Pagination currentPage={page} totalPages={totalPages} basePath={`/${categorySlug}`} />
    </main>
  );
}
