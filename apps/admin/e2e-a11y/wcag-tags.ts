/**
 * UXQ-002 — módulo local compartilhado pelos specs de `apps/admin/e2e-a11y/`
 * para a mesma política de filtro WCAG 2.2 AA cumulativo já aprovada e
 * aplicada na correção da UXQ-001 (ver doc comment original, preservado em
 * `login.a11y.spec.ts` antes desta extração, e em
 * `apps/fastcompre/e2e-a11y/home.a11y.spec.ts`).
 *
 * Centralizado aqui porque, a partir da UXQ-002, o Admin passa a ter
 * múltiplos specs consumidores no mesmo app (`login`, `create-edit-article`,
 * `publish-article`) — decisão explícita do PO nesta tarefa. O FastCompre
 * continua com um único spec de a11y (`home.a11y.spec.ts`), então sua
 * constante local lá permanece inalterada: nenhuma dependência nova entre
 * `apps/admin` e `apps/fastcompre` foi criada por esta extração.
 *
 * Os únicos tags de NÍVEL que o `axe-core@4.13.0` efetivamente instalado
 * define (confirmado por leitura direta do pacote na UXQ-001, não
 * reverificado nesta tarefa — nenhuma atualização de
 * `axe-core`/`@axe-core/playwright` ocorreu desde então) para A/AA
 * cumulativo (2.0 + 2.1 + 2.2): `wcag2a`, `wcag2aa`, `wcag21a`,
 * `wcag21aa`, `wcag22aa` (não existe `wcag22a` — a WCAG 2.2 não introduziu
 * nenhum critério de Nível A novo, só AA/AAA). Regras exclusivamente
 * `best-practice` (ex.: `page-has-heading-one`, sem nenhum tag `wcagXX`)
 * nunca correspondem a nenhum destes tags, então ficam fora do gate
 * normativo por construção, sem precisar de nenhuma allowlist adicional.
 * `wcag2aaa`/`wcag21aaa` (Nível AAA) ficam de fora deliberadamente — não
 * fazem parte do requisito normativo AA desta tarefa.
 */
export const WCAG_AA_CUMULATIVE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
