import type { Metadata } from 'next';
import { Dashboard } from './dashboard';

interface DashboardPageProps {
  params: Promise<{ siteSlug: string }>;
}

export const metadata: Metadata = {
  title: 'Dashboard — Commerce Platform Admin',
};

/**
 * `/:siteSlug` (UXA-017; Architecture.md §32 — rota nova, adicionada ao
 * Mapa de páginas por esta tarefa). Server Component fino — só resolve
 * `params` e repassa `siteSlug`, mesmo padrão de `articles/page.tsx`. Toda
 * a lógica fica em `Dashboard` (`"use client"`). Só a seção "Continuar de
 * onde parei" nesta tarefa — as demais seções do Dashboard (UXA-018) não
 * são antecipadas aqui.
 */
export default async function DashboardPage({ params }: DashboardPageProps) {
  const { siteSlug } = await params;

  return <Dashboard siteSlug={siteSlug} />;
}
