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
 *
 * Refinamento visual pré-UXW-015 — o primeiro bloco (proporção 3:2, título
 * mais largo) reflete o hero editorial que `page.tsx` passou a renderizar
 * para `items[0]`; os blocos seguintes (proporção 16:9) refletem os cards
 * normais da listagem abaixo do hero.
 *
 * Refinamento visual pós-`testeLayout.png` — os blocos de card passaram a
 * refletir o grid real (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`,
 * mesmas classes de `page.tsx`) em vez da pilha vertical anterior; 3
 * placeholders (em vez de 2) para que o esqueleto já mostre a forma da
 * terceira coluna em telas `lg:` — puramente cosmético, mesmo critério de
 * "refletir o layout real" já documentado acima, sem nenhuma mudança de
 * comportamento (continua estático, sem animação, mesmos tokens).
 *
 * Correção final de composição (pós-`testeLayout.png`, decisão fechada do
 * PO) — três ajustes para o esqueleto continuar refletindo fielmente a
 * superfície real de `page.tsx`, sem nenhum deles mudar comportamento
 * (continua estático, sem animação):
 * - `max-w-3xl` → `max-w-6xl` (mesma largura de container de `page.tsx`);
 * - o bloco do hero passa a `md:flex-row md:items-start md:gap-8`, com o
 *   placeholder de imagem em `md:w-3/5` — reflete a composição em duas
 *   zonas que o hero real ganhou a partir de `md:` (ver `page.tsx`);
 * - `gap-10` → `gap-6 md:gap-10` no grid dos cards, mesmo ajuste de
 *   espaçamento mobile aplicado ao grid real.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-fg">FastCompre</h1>
      <p className="mt-2 text-body text-fg-muted">
        Comparativos e reviews de produtos para o público brasileiro.
      </p>

      <div role="status" aria-live="polite" className="mt-10">
        <span className="sr-only">Carregando artigos…</span>
        <div aria-hidden="true">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
            <div className="aspect-[3/2] w-full shrink-0 rounded-control bg-skeleton md:w-3/5" />
            <div className="flex w-full flex-col gap-4 md:min-w-0 md:flex-1">
              <div className="h-8 w-3/4 rounded-control bg-skeleton" />
              <div className="h-4 w-1/2 rounded-control bg-skeleton" />
            </div>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10 lg:grid-cols-3">
            {[0, 1, 2].map((placeholder) => (
              <div key={placeholder} className="flex flex-col gap-4">
                <div className="aspect-video w-full rounded-control bg-skeleton" />
                <div className="h-6 w-3/4 rounded-control bg-skeleton" />
                <div className="h-4 w-1/2 rounded-control bg-skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
