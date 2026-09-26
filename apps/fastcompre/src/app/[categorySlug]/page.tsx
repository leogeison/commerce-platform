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
  // simultâneos nesta própria tarefa).
  const firstImageIndex = items.findIndex((article) => article.coverImageUrl);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-fg">{category.name}</h1>

      {items.length === 0 ? (
        <p className="mt-12 text-center text-body text-fg-muted">
          Nenhum artigo publicado nesta categoria ainda.
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
                      // texto dentro deste mesmo link (o `<h2>` abaixo) — um
                      // `alt` não vazio aqui duplicaria o título no nome
                      // acessível do link inteiro. `width`/`height`
                      // (640×360, mesmos valores da Home) são o tamanho
                      // intrínseco real; `sizes` (`ARTICLE_CARD_IMAGE_SIZES`)
                      // é a largura real do card, mesmo layout exato da
                      // Home. Mesmo critério exato de `apps/fastcompre/src/
                      // app/(home)/page.tsx` (UXW-007/UXW-013).
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

      <Pagination currentPage={page} totalPages={totalPages} basePath={`/${categorySlug}`} />
    </main>
  );
}
