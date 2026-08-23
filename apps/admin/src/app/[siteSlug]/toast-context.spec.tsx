import { useEffect } from 'react';
import { act } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { TOAST_AUTO_DISMISS_MS, ToastProvider, useToast } from './toast-context';

function ToastTrigger({ message }: { message: string }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message)}>
      Disparar toast
    </button>
  );
}

/** Dispara `showToast` sozinho, sem depender de clique/`userEvent` — usado
 * no teste de auto-dismiss para não misturar fake timers com o polling
 * interno de `userEvent`. */
function AutoTrigger({ message }: { message: string }) {
  const { showToast } = useToast();
  useEffect(() => {
    showToast(message);
  }, [message, showToast]);
  return null;
}

describe('toast-context', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('useToast fora do Provider lança erro', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    function Consumer() {
      useToast();
      return null;
    }

    expect(() => render(<Consumer />)).toThrow('useToast só pode ser usado dentro de ToastProvider.');

    spy.mockRestore();
  });

  it('a região aria-live existe desde o primeiro render, vazia, antes de qualquer showToast', () => {
    const { container } = render(
      <ToastProvider>
        <p>conteúdo</p>
      </ToastProvider>,
    );

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    expect(liveRegion).toBeEmptyDOMElement();
  });

  it('showToast insere a mensagem dentro da MESMA região já existente (não recria a live region)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ToastProvider>
        <ToastTrigger message="Categoria salva." />
      </ToastProvider>,
    );

    const liveRegionBefore = container.querySelector('[aria-live="polite"]');

    await user.click(screen.getByRole('button', { name: 'Disparar toast' }));
    await screen.findByText('Categoria salva.');

    const liveRegionAfter = container.querySelector('[aria-live="polite"]');
    expect(liveRegionAfter).toBe(liveRegionBefore);
    expect(liveRegionAfter).toHaveTextContent('Categoria salva.');
  });

  it('renderiza ícone decorativo (aria-hidden) + texto — sucesso não depende só de cor', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ToastProvider>
        <ToastTrigger message="Categoria salva." />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Disparar toast' }));
    await screen.findByText('Categoria salva.');

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('showToast não move o foco do usuário', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastTrigger message="Categoria salva." />
      </ToastProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Disparar toast' });
    await user.click(trigger);
    await screen.findByText('Categoria salva.');

    // O clique naturalmente move o foco para o próprio botão que disparou
    // o toast — comportamento padrão do navegador ao clicar num elemento
    // focável, sem relação com o componente. O que este teste prova é que
    // o toast em si nunca redireciona o foco para dentro de si mesmo: o
    // foco permanece exatamente onde o clique já o deixaria de qualquer
    // forma, e `document.activeElement` nunca fica dentro da live region.
    expect(trigger).toHaveFocus();
    expect(document.activeElement?.closest('[aria-live="polite"]')).toBeNull();
  });

  it('auto-dismiss: a mensagem some sozinha após TOAST_AUTO_DISMISS_MS, sem ação do usuário', () => {
    jest.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <AutoTrigger message="Categoria salva." />
        </ToastProvider>,
      );

      expect(screen.getByText('Categoria salva.')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
      });

      expect(screen.queryByText('Categoria salva.')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('sem violação de acessibilidade com o toast visível (jest-axe)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ToastProvider>
        <ToastTrigger message="Categoria salva." />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Disparar toast' }));
    await screen.findByText('Categoria salva.');

    expect(await axe(container)).toHaveNoViolations();
  });
});
