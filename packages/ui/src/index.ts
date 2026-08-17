/**
 * packages/ui — ponto de entrada público do pacote.
 *
 * UXF-002 (Esqueleto de `packages/ui`): fronteira formal do pacote no
 * workspace pnpm. Nenhum primitive real existe ainda — isso é escopo da
 * UXF-005. Este export type-only existe só para provar, em tempo de
 * compilação, que o pacote resolve corretamente como dependência de
 * workspace em `apps/admin` e `apps/fastcompre` — sem introduzir uma API
 * runtime artificial. A resolução em runtime de `dist/index.js` é
 * verificada separadamente, sem depender deste (ou de nenhum) valor
 * exportado (ver README.md, seção "Validação da UXF-002").
 *
 * Fronteira normativa do pacote: ver README.md.
 */
export type UiPackageSkeleton = never;
