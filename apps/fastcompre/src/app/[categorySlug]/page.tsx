import { notFound } from 'next/navigation';
import { getPublicCategory, listPublicArticles } from '@/lib/public-api/client';

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
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { categorySlug } = await params;

  const [category, { items }] = await Promise.all([
    getPublicCategory(categorySlug),
    listPublicArticles({ categorySlug }),
  ]);

  if (!category) {
    notFound();
  }

  // Correção de LCP (UXW-006 — regressão encontrada no gate contra o budget
  // da UXF-014): mesmo racional de `apps/fastcompre/src/app/(home)/page.tsx`
  // (ver comentário lá) — a primeira imagem da listagem com `coverImageUrl` é
  // o elemento LCP real desta rota. Só essa imagem sai de lazy/prioridade
  // padrão; todas as demais continuam exatamente como antes. Duplicado aqui
  // em vez de extraído para um componente compartilhado — esta rota já
  // duplicava o bloco de listagem inteiro da Home antes desta correção, e
  // UXW-008 (redesenho visual desta página) preserva essa mesma decisão: o
  // novo card reproduz localmente a linguagem visual da Home sem promover
  // nenhum componente comum a `packages/ui` nem a um módulo compartilhado
  // dentro de `apps/fastcompre`.
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
                      // acessível do link inteiro. `width`/`height` mantêm a
                      // proporção 16:9 (640×360, mesmos valores da Home) — o
                      // navegador reserva o espaço pela proporção informada
                      // nos atributos HTML antes do carregamento, prevenindo
                      // CLS. Mesmo critério exato de `apps/fastcompre/src/
                      // app/(home)/page.tsx` (UXW-007).
                      <img
                        src={article.coverImageUrl}
                        alt=""
                        width={640}
                        height={360}
                        loading={isLcpCandidate ? 'eager' : 'lazy'}
                        fetchPriority={isLcpCandidate ? 'high' : undefined}
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
    </main>
  );
}
