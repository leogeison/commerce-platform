/**
 * Fixture de verificação da UXF-004 — não é uma tela de produto. Renderiza
 * o probe técnico de packages/ui/src/probe.tsx para provar visualmente e
 * via build que o content-scanning do Tailwind alcança o pacote. Ver
 * packages/ui/src/probe.tsx.
 *
 * `robots: { index: false, follow: false }` — esta rota fica permanente
 * (fixture de regressão), mas o FastCompre é público e tem sitemap/robots
 * reais (WEB-007/WEB-008); esta metadata local evita que a fixture seja
 * indexada, sem tocar apps/fastcompre/src/app/robots.ts ou sitemap.ts.
 */
import type { Metadata } from 'next';
import { TailwindScanProbe } from '@commerce-platform/ui/probe';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TailwindScanProbePage() {
  return <TailwindScanProbe />;
}
