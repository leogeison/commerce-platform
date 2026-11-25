import type { ContextType } from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import LoginPage from './page';

/**
 * UXP-004 — composição da página de login (identidade Commerce Platform,
 * painéis, landmarks e textos aprovados). Comportamento do formulário em
 * `login-form.spec.tsx`; layout real (painéis, reflow) em browser real
 * (`e2e-a11y/login-presentation.spec.ts`).
 */
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
};

function renderPage() {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <LoginPage />
    </AppRouterContext.Provider>,
  );
}

describe('LoginPage (UXP-004)', () => {
  it('formulário no <main>, com rótulo, H1 único, subtítulo e aviso de acesso restrito', () => {
    renderPage();
    const main = screen.getByRole('main');
    expect(within(main).getByText('Acesso administrativo')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(main).getByRole('heading', { level: 1, name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(within(main).getByText('Entre com suas credenciais para continuar.')).toBeInTheDocument();
    expect(within(main).getByRole('form', { name: 'Bem-vindo de volta' })).toBeInTheDocument();
    expect(within(main).getByText('Acesso restrito a usuários autorizados')).toBeInTheDocument();
  });

  it('painel institucional como <aside> com a identidade Commerce Platform e os textos aprovados, sem FastCompre', () => {
    const { container } = renderPage();
    const aside = screen.getByRole('complementary', { name: 'Commerce Platform' });
    expect(within(aside).getByText('Gestão editorial')).toBeInTheDocument();
    expect(within(aside).getByText('Sua operação editorial em um só lugar.')).toBeInTheDocument();
    expect(
      within(aside).getByText('Gerencie conteúdos, produtos e ofertas com simplicidade e eficiência.'),
    ).toBeInTheDocument();
    expect(within(aside).getByText(`© ${new Date().getFullYear()} Commerce Platform`)).toBeInTheDocument();
    // Painel sem nenhum elemento focável (a reordenação visual não muda a ordem de foco).
    expect(aside.querySelectorAll('a, button, input, select, textarea, [tabindex]')).toHaveLength(0);
    // Ilustração e ícones decorativos.
    for (const svg of aside.querySelectorAll('svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
    expect(container.textContent).not.toMatch(/FastCompre/i);
  });

  it('formulário vem antes do painel institucional no DOM (prioridade no mobile e na ordem de leitura)', () => {
    renderPage();
    const main = screen.getByRole('main');
    const aside = screen.getByRole('complementary', { name: 'Commerce Platform' });
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('não oferece recuperação de senha, cadastro, "lembrar de mim" nem login social', () => {
    renderPage();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent || button.getAttribute('aria-label'))).toEqual([
      'Mostrar senha',
      'Entrar',
    ]);
  });

  it('não tem violação de acessibilidade (jest-axe)', async () => {
    const { container } = renderPage();
    expect(await axe(container)).toHaveNoViolations();
  });
});
