/**
 * Fixture de verificação da UXF-004 — não é uma tela de produto. Renderiza
 * o probe técnico de packages/ui/src/probe.tsx para provar visualmente e
 * via build que o content-scanning do Tailwind alcança o pacote. Ver
 * packages/ui/src/probe.tsx.
 */
import { TailwindScanProbe } from '@commerce-platform/ui/probe';

export default function TailwindScanProbePage() {
  return <TailwindScanProbe />;
}
