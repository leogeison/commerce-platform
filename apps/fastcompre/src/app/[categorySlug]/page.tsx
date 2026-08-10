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

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{category.name}</h1>

      {items.length === 0 ? (
        <p className="mt-8 text-neutral-500">Nenhum artigo publicado ainda.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-8">
          {items.map((article) => (
            <li key={article.id}>
              <a href={`/${article.categorySlug}/${article.slug}`} className="flex gap-4">
                {article.coverImageUrl && (
                  <img
                    src={article.coverImageUrl}
                    alt={article.title}
                    width={160}
                    height={90}
                    loading="lazy"
                    className="aspect-video w-40 shrink-0 rounded object-cover"
                  />
                )}
                <div>
                  <h2 className="font-medium">{article.title}</h2>
                  {article.metaDescription && (
                    <p className="text-sm text-neutral-500">{article.metaDescription}</p>
                  )}
                  <time dateTime={article.publishedAt} className="text-xs text-neutral-400">
                    {new Date(article.publishedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </time>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
