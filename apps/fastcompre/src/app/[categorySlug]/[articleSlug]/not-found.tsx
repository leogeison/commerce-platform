/**
 * Boundary de `notFound()` (WEB-010) para o segmento de rota do Artigo —
 * captura só o `notFound()` já lançado por `page.tsx` (WEB-004) quando o
 * artigo não existe; não altera esse `notFound()`. Por estar mais próximo na
 * árvore de segmentos, continua tendo prioridade sobre o 404 genérico da
 * raiz (`app/not-found.tsx`, UXW-014) só para este caso — Categoria/Home
 * usam o genérico, já que não têm (e não precisam de) uma mensagem
 * específica própria.
 *
 * UXW-014 — restyle para o padrão visual "Editorial Confiável"
 * (docs/UXW-visual-direction-decision.md): mesmos tokens do 404 genérico da
 * raiz (`text-fg`/`text-fg-muted`, foco visível via `ring-focus`) no lugar
 * das classes cruas anteriores (`text-neutral-500`, link sem foco visível).
 * Mensagem específica de Artigo preservada — não é a mesma copy do 404
 * genérico.
 *
 * Componente puro, sem `fetch`/props — o Next.js já responde com status
 * `404` HTTP automaticamente ao renderizar esta boundary, sem lógica manual
 * aqui. Mesma estrutura visual mínima das outras páginas públicas
 * (`mx-auto max-w-3xl px-4 py-12`, um `<h1>` por página).
 */
export default function ArticleNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-fg">Artigo não encontrado</h1>
      <p className="mt-2 text-body text-fg-muted">
        O artigo que você está procurando não existe ou não está mais disponível.
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
