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
  // primeiro item da lista. Preservado integralmente pela UXW-007 — só o
  // markup ao redor da imagem mudou (ver comentário sobre `width`/`height`
  // abaixo), a lógica que decide QUAL imagem recebe prioridade não.
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
                      // acessível do link inteiro. `width`/`height` mantêm
                      // a mesma proporção 16:9 de antes (160×90); só os
                      // valores absolutos mudam, para casar com a
                      // renderização fluida (`w-full aspect-video`) — o
                      // navegador continua reservando o espaço pela
                      // proporção informada nos atributos HTML antes do
                      // carregamento, prevenindo CLS, exatamente como
                      // antes.
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
