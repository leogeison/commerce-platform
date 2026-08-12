import type { ReactNode } from 'react';
import { AuthenticatedShell } from './authenticated-shell';

interface SiteLayoutProps {
  children: ReactNode;
  params: Promise<{ siteSlug: string }>;
}

/**
 * `/:siteSlug/*` (ADM-004; Architecture.md §32). Server Component puro —
 * só resolve `params` (Next.js 16 entrega `params` como Promise, mesma
 * convenção de `apps/fastcompre/src/app/[categorySlug]/page.tsx`) e repassa
 * `siteSlug` como prop simples. Toda a lógica (sessão, validação de Site,
 * navegação, seletor de Site, logout) fica em `AuthenticatedShell`
 * (`"use client"`) — mesma fronteira estreita já usada em
 * `LoginForm`/`Home`.
 */
export default async function SiteLayout({ children, params }: SiteLayoutProps) {
  const { siteSlug } = await params;

  return <AuthenticatedShell siteSlug={siteSlug}>{children}</AuthenticatedShell>;
}
