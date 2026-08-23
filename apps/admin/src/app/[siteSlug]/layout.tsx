import type { ReactNode } from 'react';
import { AuthenticatedShell } from './authenticated-shell';
import { ToastProvider } from './toast-context';
import { UnsavedChangesProvider } from './unsaved-changes-context';

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
 *
 * `UnsavedChangesProvider` (UXA-003) envolve `AuthenticatedShell` — não o
 * contrário — porque o próprio `AuthenticatedShell` consome o guard
 * (`GuardedLink` na navegação, `confirmLeave()` na troca de Site e no
 * Logout); um componente não alcança um Context que ele mesmo declara.
 *
 * `ToastProvider` (UXA-004) envolve tudo, no mesmo nível de
 * `UnsavedChangesProvider` — os dois Contexts são independentes entre si,
 * sem ordem obrigatória. O motivo de estar aqui, e não mais abaixo (ex.:
 * dentro de `categories/`), é o mesmo de `UnsavedChangesProvider`: precisa
 * sobreviver à troca de rota dentro de `[siteSlug]` (ex.: criar Categoria
 * navegando via `router.replace` para o detalhe) — só `children` é trocado
 * pelo router; o layout, e com ele este Provider, nunca desmonta.
 */
export default async function SiteLayout({ children, params }: SiteLayoutProps) {
  const { siteSlug } = await params;

  return (
    <ToastProvider>
      <UnsavedChangesProvider>
        <AuthenticatedShell siteSlug={siteSlug}>{children}</AuthenticatedShell>
      </UnsavedChangesProvider>
    </ToastProvider>
  );
}
