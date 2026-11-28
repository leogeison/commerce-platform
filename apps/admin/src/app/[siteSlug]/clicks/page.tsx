import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClicksDashboard } from './clicks-dashboard';

interface ClicksPageProps {
  params: Promise<{ siteSlug: string }>;
}

export const metadata: Metadata = {
  title: 'Cliques — Commerce Platform Admin',
};

/**
 * UXP-006 — dashboard de cliques de afiliados (`/:siteSlug/clicks`).
 * `Suspense`: `ClicksDashboard` lê os filtros da URL (`useSearchParams`).
 */
export default async function ClicksPage({ params }: ClicksPageProps) {
  const { siteSlug } = await params;

  return (
    <Suspense fallback={<p role="status">Carregando…</p>}>
      <ClicksDashboard siteSlug={siteSlug} />
    </Suspense>
  );
}
