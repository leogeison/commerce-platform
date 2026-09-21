'use client'; // Error boundaries precisam ser Client Components (Next.js)

/**
 * apps/fastcompre/src/app/(home)/error.tsx
 *
 * UXW-007 — Error Boundary de rota da Home, escopado ao Route Group
 * `(home)` (isolado de Categoria/Artigo). Cobre falha da chamada a
 * `listPublicArticles()` (rede/HTTP) — hoje a única causa realista de erro
 * nesta rota; a Home nunca chama `notFound()` (isso é Categoria/Artigo).
 *
 * Mensagem sempre genérica — nunca `error.message`/`error.digest`: em
 * produção, erros vindos de Server Components já chegam ao cliente com uma
 * mensagem genérica + identificador (por desenho do próprio Next, para não
 * vazar detalhe sensível), mas mesmo assim este componente não renderiza
 * `error.message`/`error.digest` na UI sob nenhuma circunstância — decisão
 * fechada da UXW-007, verificada por teste.
 *
 * Sem `console.error`/logging novo: não há necessidade concreta registrada
 * para esta tarefa (ajuste explícito desta implementação) — o parâmetro
 * `error` é recebido (contrato do Next) mas não é impresso em lugar nenhum
 * aqui.
 *
 * `reset()` (não `unstable_retry()`, introduzido no `error.js` a partir do
 * Next 16.2.0 como a opção agora recomendada pela documentação) — decisão
 * explícita já fechada nesta tarefa antes da implementação.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-fg">FastCompre</h1>

      <p className="mt-10 text-body text-fg" role="alert">
        Não foi possível carregar os artigos agora.
      </p>

      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-control border border-outline px-control-x py-control-y font-ui font-action text-body text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus"
      >
        Tentar novamente
      </button>
    </main>
  );
}
