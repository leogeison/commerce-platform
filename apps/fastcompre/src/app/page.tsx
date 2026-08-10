import { connection } from 'next/server';
import { listPublicArticles } from '@/lib/public-api/client';

/**
 * `connection()` adia a renderização para o momento da requisição, então
 * `next build` não precisa da API viva. `fetchCache = 'force-cache'` faz o
 * `fetch()` de `listPublicArticles` ser reaproveitado via Data Cache em vez
 * de ser refeito a cada visitante.
 */
export const fetchCache = 'force-cache';

export default async function Home() {
  await connection();
  const { items } = await listPublicArticles();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">FastCompre</h1>
      <p className="mt-1 text-neutral-500">
        Comparativos e reviews de produtos para o público brasileiro.
      </p>

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
