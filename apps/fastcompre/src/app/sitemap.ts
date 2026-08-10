import { connection } from 'next/server';
import type { MetadataRoute } from 'next';
import { listPublicArticles } from '@/lib/public-api/client';
import { env } from '@/lib/env';

/**
 * `connection()` adia a renderização para o momento da requisição, então
 * `next build` não precisa da API viva (mesmo motivo da Home). `fetchCache =
 * 'force-cache'` faz cada `fetch()` de `listPublicArticles` ser reaproveitado
 * via Data Cache em vez de refeito a cada visitante.
 */
export const fetchCache = 'force-cache';

/**
 * Sitemap (WEB-007) — apenas URLs de Artigo `PUBLISHED` (única listagem que
 * `listPublicArticles` expõe). Home e Categoria ficam fora do escopo desta
 * tarefa. Sem `lastModified`, `changeFrequency` ou `priority` (decisão
 * fechada: omitir nesta tarefa).
 *
 * `pageSize: 100` (o máximo aceito por `listPublicArticlesQuerySchema`)
 * minimiza o número de requisições; o loop consome todas as páginas via
 * `totalPages`, já que a listagem não tem um modo "sem paginação".
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();

  const urls: string[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await listPublicArticles({ page, pageSize: 100 });
    for (const article of response.items) {
      urls.push(new URL(`/${article.categorySlug}/${article.slug}`, env.SITE_URL).toString());
    }
    totalPages = response.totalPages;
    page += 1;
  } while (page <= totalPages);

  return urls.map((url) => ({ url }));
}
