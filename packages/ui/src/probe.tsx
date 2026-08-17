/**
 * packages/ui/src/probe.tsx
 *
 * UXF-004 — probe técnico de content-scanning cross-package do Tailwind.
 *
 * NÃO é um primitive do design system: sem variantes, sem estados de
 * interação, sem decisão de design. Button/Text/Skeleton nascem na UXF-005,
 * independentemente deste arquivo.
 *
 * Exportado via subpath dedicado `@commerce-platform/ui/probe`
 * (packages/ui/package.json#exports) — por estar em `exports`, esse
 * subpath é tecnicamente público (qualquer consumidor do pacote pode
 * importá-lo). Classificação: é API técnica de probe/teste, não API de
 * primitives do design system. Existe só para provar que o scanner do
 * Tailwind de cada app alcança classes usadas dentro de `packages/ui` e
 * gera CSS equivalente nos dois builds, e para servir de fixture da
 * regressão automatizada permanente
 * (scripts/verify-tailwind-cross-package-scan.mjs).
 *
 * Classes Tailwind declaradas como string literal estática diretamente no
 * JSX — a mesma forma convencional que os primitives reais (UXF-005) vão
 * usar, sem composição em runtime (array+join, template literal,
 * concatenação condicional).
 *
 * A lista de classes abaixo é deliberadamente independente da lista
 * mantida em scripts/verify-tailwind-cross-package-scan.mjs — ver o
 * comentário desse script para a justificativa dessa duplicação
 * intencional. Se estas classes mudarem, atualize também a lista de lá.
 */
export function TailwindScanProbe() {
  return (
    <div
      data-testid="tailwind-scan-probe"
      className="flex items-center gap-2 rounded-md border p-4 text-sm font-semibold text-slate-700"
    >
      Tailwind scan probe (UXF-004)
    </div>
  );
}
