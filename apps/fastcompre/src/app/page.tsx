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

  // Correção de LCP (UXW-006 — regressão encontrada no gate contra o budget
  // da UXF-014): a primeira imagem da listagem com `coverImageUrl` é o
  // elemento LCP real desta rota (confirmado pelo relatório Lighthouse —
  // `img.aspect-video`). `loading="lazy"` nela atrasa o INÍCIO do fetch até
  // o navegador confirmar proximidade do viewport (resourceLoadDelay ≈
  // 1,7 s medido, muito acima do resourceLoadDuration real de ≈ 0,7 s), e a
  // ausência de `fetchPriority` deixa esse fetch em prioridade padrão,
  // competindo com os demais recursos da página. Só essa imagem sai de
  // lazy/prioridade padrão — todas as demais continuam exatamente como
  // antes. `findIndex` em vez de `index === 0`: nem todo artigo tem
  // `coverImageUrl` (campo opcional), então o candidato a LCP é o primeiro
  // artigo da lista que REALMENTE tem imagem, não necessariamente o
  // primeiro item da lista.
  const firstImageIndex = items.findIndex((article) => article.coverImageUrl);

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
          {items.map((article, index) => {
            const isLcpCandidate = index === firstImageIndex;

            return (
              <li key={article.id}>
                <a href={`/${article.categorySlug}/${article.slug}`} className="flex gap-4">
                  {article.coverImageUrl && (
                    <img
                      src={article.coverImageUrl}
                      alt={article.title}
                      width={160}
                      height={90}
                      loading={isLcpCandidate ? 'eager' : 'lazy'}
                      fetchPriority={isLcpCandidate ? 'high' : undefined}
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
            );
          })}
        </ul>
      )}
    </main>
  );
}
