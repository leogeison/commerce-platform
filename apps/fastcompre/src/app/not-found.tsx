/**
 * apps/fastcompre/src/app/not-found.tsx
 *
 * UXW-014 — 404 genérico no padrão visual "Editorial Confiável"
 * (docs/UXW-visual-direction-decision.md). O Next.js resolve `notFound()`
 * subindo a árvore de segmentos, a partir de onde foi lançado, até achar um
 * `not-found.tsx` — este arquivo, na raiz de `app/`, é o boundary para
 * qualquer segmento sem um `not-found.tsx` mais específico. Hoje isso cobre:
 * - Home (`(home)/page.tsx`) — paginação inválida/fora de faixa (UXW-012);
 * - Categoria (`[categorySlug]/page.tsx`) — categoria inexistente e
 *   paginação inválida/fora de faixa (UXW-012).
 * Antes desta tarefa, nenhum dos dois tinha boundary próprio nem herdava um
 * mais próximo — o `notFound()` desses segmentos caía no 404 genérico e não
 * estilizado do Next.js. Este arquivo NÃO altera nenhuma regra de quando
 * `notFound()` é chamado (código já existente e aprovado nas próprias
 * páginas) — só fornece a UI que o framework já resolve automaticamente.
 *
 * O segmento de Artigo mantém seu próprio `not-found.tsx`
 * (`[categorySlug]/[articleSlug]/not-found.tsx`), com mensagem mais
 * específica ("Artigo não encontrado") — por ser mais próximo na árvore de
 * segmentos, ele continua tendo prioridade sobre este arquivo para esse caso;
 * este 404 raiz nunca o substitui.
 *
 * Visual mínimo, sem ícone/ilustração, sem número "404" grande, sem CTA
 * comercial e sem dependência nova — mesmo shell das demais páginas públicas
 * (`mx-auto max-w-3xl px-4 py-12`, um único `<h1>` por página) e os mesmos
 * tokens (`text-fg`/`text-fg-muted`, foco visível via `ring-focus`) já
 * usados em `(home)/error.tsx`/`(home)/loading.tsx`. Componente puro, sem
 * `fetch`/props — o Next.js já responde com status HTTP `404`
 * automaticamente ao renderizar esta boundary.
 */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-fg">Página não encontrada</h1>
      <p className="mt-2 text-body text-fg-muted">
        O conteúdo que você está procurando não existe ou não está mais disponível.
      </p>
      <a
        href="/"
        className="mt-6 inline-block text-fg underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 ring-focus"
      >
        Voltar para a Home
      </a>
    </main>
  );
}
