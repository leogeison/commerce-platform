import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

/**
 * Spec permanente da UXF-008 — prova e protege contra regressão a
 * capacidade de teste de componente interativo do FastCompre (`jsdom` +
 * Testing Library + `user-event`), que os outros 10 specs existentes não
 * exercitam (eles usam `renderToStaticMarkup`, sem interação real nem DOM).
 *
 * O componente abaixo existe só para este teste — não é parte da UI do
 * produto (por isso definido aqui, não em um arquivo de produção). Se um
 * contador real for necessário no produto no futuro, ele nasce em sua
 * própria tarefa, não aqui.
 */
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button type="button" onClick={() => setCount((current) => current + 1)}>
      Cliques: {count}
    </button>
  );
}

describe('Capacidade de teste interativo (jsdom + Testing Library + user-event)', () => {
  it('renderiza, localiza por role, interage via userEvent e reflete a mudança no DOM', async () => {
    const user = userEvent.setup();
    render(<Counter />);

    const button = screen.getByRole('button', { name: 'Cliques: 0' });

    await user.click(button);

    // Mesmo nó do DOM, mutado in-place pelo React — prova tanto a
    // alteração observável de estado/DOM quanto que o nome acessível
    // (derivado do texto do botão) reflete o novo estado.
    expect(button.textContent).toBe('Cliques: 1');
    expect(screen.getByRole('button', { name: 'Cliques: 1' })).toBe(button);
  });
});
