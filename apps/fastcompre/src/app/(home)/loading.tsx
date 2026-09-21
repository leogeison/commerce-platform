/**
 * apps/fastcompre/src/app/(home)/loading.tsx
 *
 * UXW-007 — fallback de carregamento da Home, escopado ao Route Group
 * `(home)` (isolado de Categoria/Artigo — ver docs/UX-Implementation-
 * Backlog.md, UXW-007/UXW-014). O Next envolve automaticamente `page.tsx`
 * deste mesmo segmento num `<Suspense>`; nenhuma composição manual é
 * necessária aqui.
 *
 * Decisão fechada: simples, sem animação — por isso NÃO reutiliza o
 * componente `Skeleton` de `packages/ui` (que aplica `motion-safe:
 * animate-pulse` de forma incondicional, sem prop para desligar). Usa
 * diretamente o token `bg-skeleton` (o mesmo que `Skeleton` consome) em
 * blocos estáticos — sem pulsar mesmo para quem não tem `prefers-reduced-
 * motion` ativado, e sem exigir alterar o componente compartilhado (que
 * também serve o Admin).
 *
 * `role="status"`/`aria-live="polite"` + texto `sr-only` comunicam o
 * estado de carregamento a tecnologia assistiva; os blocos placeholder em
 * si são `aria-hidden` — mesmo critério já documentado em `Skeleton`
 * (quem anuncia o estado é o container consumidor, não o placeholder).
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-fg">FastCompre</h1>
      <p className="mt-2 text-body text-fg-muted">
        Comparativos e reviews de produtos para o público brasileiro.
      </p>

      <div role="status" aria-live="polite" className="mt-10">
        <span className="sr-only">Carregando artigos…</span>
        <div className="flex flex-col gap-10" aria-hidden="true">
          {[0, 1, 2].map((placeholder) => (
            <div key={placeholder} className="flex flex-col gap-4">
              <div className="aspect-video w-full rounded-control bg-skeleton" />
              <div className="h-6 w-3/4 rounded-control bg-skeleton" />
              <div className="h-4 w-1/2 rounded-control bg-skeleton" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
