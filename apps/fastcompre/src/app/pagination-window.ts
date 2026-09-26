/**
 * apps/fastcompre/src/app/pagination-window.ts
 *
 * UXW-012 — lógica pura de paginação (validação de `page`, construção de
 * `href` e da janela truncada de páginas), separada de `pagination.tsx`
 * (o componente em si). Mesma convenção já em uso no repositório para
 * separar lógica pura de componente (`product-block-resolver.ts` /
 * `product-block.tsx`, `affiliate-redirect-href.ts`) — aqui, além de
 * seguir a convenção, evita o aviso `react-refresh/only-export-components`
 * do ESLint (`pagination.tsx` passa a exportar só o componente
 * `Pagination`).
 */

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

/**
 * Resolve o parâmetro `page` da querystring para um inteiro positivo
 * estrito, ou `null` quando o valor é malformado. Decisão fechada da
 * UXW-012: `page` ausente → página 1 (comportamento atual preservado);
 * qualquer valor que não seja um inteiro positivo sem zeros à esquerda
 * (`0`, negativo, decimal, texto) é inválido; múltiplos valores repetidos
 * (`?page=1&page=2`) chegam como array pelo `searchParams` do Next.js e
 * também são inválidos — nenhum dos dois casos é normalizado
 * silenciosamente, quem chama esta função decide o que fazer com `null`
 * (na UXW-012, sempre `notFound()`, antes de chamar a API pública).
 */
export function resolvePageParam(rawParam: string | string[] | undefined): number | null {
  if (rawParam === undefined) {
    return 1;
  }
  if (Array.isArray(rawParam)) {
    return null;
  }
  if (!POSITIVE_INTEGER_PATTERN.test(rawParam)) {
    return null;
  }
  return Number(rawParam);
}

/**
 * `href` de uma página — nunca gera `?page=1` (decisão fechada: a página 1
 * é sempre a `basePath` "limpa"). `pageSize` nunca é parâmetro desta
 * função nem aparece em nenhum `href` gerado por ela.
 */
export function hrefForPage(basePath: string, page: number): string {
  if (page <= 1) {
    return basePath;
  }
  const separator = basePath.includes('?') ? '&' : '?';
  return `${basePath}${separator}page=${page}`;
}

export type PageWindowItem = number | { ellipsis: true; key: string };

/**
 * Janela truncada: primeira, última, atual ±1, sem duplicar bordas
 * (`Set`, não checagem manual) — reticências (`{ ellipsis: true }`)
 * preenchendo qualquer lacuna maior que 1 entre dois números consecutivos
 * mantidos.
 */
export function buildPageWindow(currentPage: number, totalPages: number): PageWindowItem[] {
  const pageNumbers = new Set<number>();
  pageNumbers.add(1);
  pageNumbers.add(totalPages);
  for (let page = currentPage - 1; page <= currentPage + 1; page += 1) {
    if (page >= 1 && page <= totalPages) {
      pageNumbers.add(page);
    }
  }

  const sorted = Array.from(pageNumbers).sort((a, b) => a - b);
  const items: PageWindowItem[] = [];
  let previous: number | null = null;

  for (const page of sorted) {
    if (previous !== null && page - previous > 1) {
      items.push({ ellipsis: true, key: `ellipsis-${previous}-${page}` });
    }
    items.push(page);
    previous = page;
  }

  return items;
}
