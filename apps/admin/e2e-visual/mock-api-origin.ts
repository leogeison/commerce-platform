/**
 * UXA-020 — única fonte de verdade da origem fictícia da API para este
 * mecanismo de baseline: consumida por `playwright.config.ts`
 * (`webServer.env.NEXT_PUBLIC_API_URL`, inlinada no bundle do cliente por
 * `next build`) e por `dashboard.visual.spec.ts` (prefixo exato dos
 * padrões de `page.route()`). Um único import elimina por construção
 * qualquer risco de as duas divergirem — não depende de duas literais
 * mantidas em sincronia manualmente, nem de a captura "funcionar por
 * coincidência" com o valor de build de uma execução anterior.
 *
 * Nunca alcançada de fato: todo fetch para esta origem é interceptado por
 * `page.route()` antes de qualquer `page.goto()` — ver
 * `dashboard.visual.spec.ts`. Mesmo valor convencional já usado em
 * `.github/workflows/ci.yml` para o build do Admin (nunca um endereço
 * real/alcançável).
 */
export const MOCK_API_ORIGIN = 'http://127.0.0.1:9999';
