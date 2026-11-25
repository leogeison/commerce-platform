import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { LoginBrandMark, LoginBrandPanel } from './login-brand-panel';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Login — Commerce Platform Admin',
};

/**
 * `/login` (ADM-002; Architecture.md §32, mapa de páginas). Server Component
 * puro — só estrutura e `metadata`, nenhuma lógica/estado. `LoginForm`
 * (`"use client"`) concentra toda a interatividade, mantendo a fronteira
 * client a mais estreita possível.
 *
 * Sem guarda de "usuário já autenticado": fora de escopo desta tarefa
 * (decisão explícita) — fica para quando o layout autenticado (`ADM-004`)
 * existir.
 *
 * UXP-004 — redesign visual, identidade Commerce Platform:
 * - ≥ lg (1024px): dois painéis — institucional escuro (48%) à esquerda e
 *   formulário (52%) à direita, centralizado, até 400px;
 * - < lg: faixa superior escura só com a marca, formulário em destaque,
 *   copyright abaixo; sem conteúdo institucional.
 * No DOM o `<main>` (formulário) vem antes do `<aside>` institucional, que
 * é posicionado à esquerda só por CSS (`order`) no desktop — o painel não
 * tem elementos focáveis, então a ordem de foco segue a ordem visual.
 */
export default function LoginPage() {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-dvh flex-col bg-page-surface lg:flex-row">
      <header className="bg-inverse-surface px-4 py-4 sm:px-6 lg:hidden">
        <LoginBrandMark size="sm" />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 lg:order-2 lg:w-[52%] lg:px-12">
        <div className="w-full max-w-[400px]">
          <p className="m-0 font-ui text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-fg-muted">
            Acesso administrativo
          </p>
          <h1 id="login-title" className="mb-2 mt-3 font-ui text-3xl font-semibold tracking-tight text-fg">
            Bem-vindo de volta
          </h1>
          <p className="mb-8 mt-0 font-ui text-body text-fg-muted">Entre com suas credenciais para continuar.</p>

          <LoginForm />

          <p className="mb-0 mt-6 flex items-center justify-center gap-2 font-ui text-body-sm text-fg-muted">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
            Acesso restrito a usuários autorizados
          </p>
        </div>

        <p className="mb-0 mt-10 font-ui text-body-sm text-fg-muted lg:hidden">© {year} Commerce Platform</p>
      </main>

      <LoginBrandPanel year={year} />
    </div>
  );
}
