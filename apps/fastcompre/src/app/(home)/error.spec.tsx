import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Error from './error';

/**
 * apps/fastcompre/src/app/(home)/error.spec.tsx
 *
 * `Error` é Client Component — Testing Library (`render`/`screen`/
 * `userEvent`), mesmo padrão já usado em `category-nav.spec.tsx`/
 * `shell.integration.spec.tsx` para partes interativas reais.
 *
 * `apps/fastcompre` não depende de `@testing-library/jest-dom` (só
 * `apps/admin` depende — ver `category-nav.spec.tsx`) — por isso nenhum
 * matcher `toHaveTextContent`/`toHaveClass`/`toBeInTheDocument` é usado
 * aqui; todas as asserções usam a API de DOM padrão (`.textContent`,
 * `.className`, `queryByText(...) === null`), mesma disciplina do resto
 * do app.
 */
describe('Error (Home)', () => {
  // Objeto literal (não `new Error()`) — sob o transform SWC/jsdom deste
  // projeto, a instância real de `Error` chega não extensível ao teste,
  // impedindo atribuir `digest` depois de construída. `Error` (componente)
  // só lê `.message`/`.digest`, nunca `instanceof`, então um literal com o
  // mesmo formato é suficiente e evita o problema.
  function buildError(message: string): Error & { digest?: string } {
    return { name: 'Error', message, digest: 'SENSITIVE_DIGEST_1234' } as Error & {
      digest?: string;
    };
  }

  it('mostra uma mensagem genérica para o usuário, nunca error.message ou digest', () => {
    const error = buildError('ECONNREFUSED 127.0.0.1:5432 — detalhe interno de infraestrutura');
    render(<Error error={error} reset={jest.fn()} />);

    expect(screen.getByRole('alert').textContent).toBe('Não foi possível carregar os artigos agora.');
    expect(screen.queryByText(error.message)).toBeNull();
    expect(screen.queryByText(/SENSITIVE_DIGEST_1234/)).toBeNull();
    expect(document.body.innerHTML).not.toContain(error.message);
    expect(document.body.innerHTML).not.toContain('SENSITIVE_DIGEST_1234');
  });

  it('tem um botão "Tentar novamente" com nome acessível e classe de foco visível no padrão do projeto', () => {
    render(<Error error={buildError('erro qualquer')} reset={jest.fn()} />);

    const button = screen.getByRole('button', { name: 'Tentar novamente' });
    expect(button.className).toContain('focus-visible:outline-none');
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.className).toContain('ring-focus');
  });

  it('chama reset() ao clicar em "Tentar novamente"', async () => {
    const reset = jest.fn();
    render(<Error error={buildError('erro qualquer')} reset={reset} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
