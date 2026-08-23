import { useEffect } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { UnsavedChangesProvider, useSyncFormDirty, useUnsavedChangesGuard } from './unsaved-changes-context';

/**
 * Publica `isDirty` no Context via `useSyncFormDirty` — o mesmo mecanismo
 * que `CategoryForm` usa com `formState.isDirty` da RHF, só que aqui
 * controlado diretamente pelo teste, sem depender de um formulário real.
 */
function DirtyPublisher({ isDirty }: { isDirty: boolean }) {
  useSyncFormDirty(isDirty);
  return null;
}

function ConfirmButton() {
  const { confirmLeave } = useUnsavedChangesGuard();
  return (
    <button
      type="button"
      onClick={() => {
        void confirmLeave();
      }}
    >
      Tentar sair
    </button>
  );
}

function ConfirmProbe() {
  const { confirmLeave } = useUnsavedChangesGuard();
  return (
    <button
      type="button"
      onClick={async () => {
        const result = await confirmLeave();
        document.getElementById('result')!.textContent = String(result);
      }}
    >
      Tentar sair
    </button>
  );
}

describe('unsaved-changes-context', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('useUnsavedChangesGuard fora do Provider lança erro', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    function Consumer() {
      useUnsavedChangesGuard();
      return null;
    }

    expect(() => render(<Consumer />)).toThrow(
      'useUnsavedChangesGuard só pode ser usado dentro de UnsavedChangesProvider.',
    );

    spy.mockRestore();
  });

  it('useSyncFormDirty fora do Provider lança erro', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<DirtyPublisher isDirty />)).toThrow(
      'useSyncFormDirty só pode ser usado dentro de UnsavedChangesProvider.',
    );

    spy.mockRestore();
  });

  it('sem isDirty: confirmLeave() resolve true sem abrir o diálogo', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty={false} />
        <ConfirmProbe />
        <p id="result" />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(document.getElementById('result')).toHaveTextContent('true'));
  });

  it('com isDirty: confirmLeave() abre o diálogo com nome acessível e foco inicial em "Ficar"', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
        <ConfirmButton />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    const dialog = await screen.findByRole('dialog', { name: 'Alterações não salvas' });
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ficar' })).toHaveFocus());
  });

  it('Cancelar ("Ficar"): confirmLeave() resolve false, foco retorna ao elemento de origem', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
        <ConfirmProbe />
        <p id="result" />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'Tentar sair' });
    await user.click(trigger);

    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Ficar' }));

    await waitFor(() => expect(document.getElementById('result')).toHaveTextContent('false'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('Confirmar ("Sair sem salvar"): confirmLeave() resolve true', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
        <ConfirmProbe />
        <p id="result" />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));

    await waitFor(() => expect(document.getElementById('result')).toHaveTextContent('true'));
  });

  it('Escape: fecha o diálogo e confirmLeave() resolve false, igual a Cancelar', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
        <ConfirmProbe />
        <p id="result" />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(document.getElementById('result')).toHaveTextContent('false'));
  });

  it('segunda tentativa com o diálogo já aberto reaproveita a mesma confirmação (não abre um segundo diálogo)', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
        <ConfirmButton />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'Tentar sair' });
    await user.click(trigger);
    await screen.findByRole('dialog');

    await user.click(trigger);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('desmonte do Provider com confirmação pendente resolve false (não deixa a Promise pendurada)', async () => {
    let capturedConfirmLeave!: () => Promise<boolean>;

    // Reatribuir uma variável externa durante o corpo do render é um side
    // effect impuro (`react-hooks/globals`) — a captura precisa acontecer
    // na fase correta, um effect, não no render em si. `render()` do
    // Testing Library roda dentro de `act()` e já resolve os effects antes
    // de retornar, então `capturedConfirmLeave` está pronto no momento em
    // que o teste chama `capturedConfirmLeave()` logo abaixo.
    function CaptureGuard() {
      const { confirmLeave } = useUnsavedChangesGuard();
      useEffect(() => {
        capturedConfirmLeave = confirmLeave;
      }, [confirmLeave]);
      return null;
    }

    const { unmount } = render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
        <CaptureGuard />
      </UnsavedChangesProvider>,
    );

    const pending = capturedConfirmLeave();

    unmount();

    await expect(pending).resolves.toBe(false);
  });

  it('não tem violação de acessibilidade com o diálogo aberto (jest-axe)', async () => {
    const { container } = render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
        <ConfirmButton />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
    await screen.findByRole('dialog');

    expect(await axe(container)).toHaveNoViolations();
  });

  // --- UXA-003 (ajuste): beforeunload para unload real (refresh/fechar/hard navigation) ---

  it('beforeunload: com isDirty, o unload é interceptado (preventDefault)', () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
      </UnsavedChangesProvider>,
    );

    const event = new Event('beforeunload', { cancelable: true });
    const notCancelled = window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(notCancelled).toBe(false);
  });

  it('beforeunload: sem isDirty, o unload não é interceptado', () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty={false} />
      </UnsavedChangesProvider>,
    );

    const event = new Event('beforeunload', { cancelable: true });
    const notCancelled = window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(notCancelled).toBe(true);
  });

  it('beforeunload: para de bloquear depois que o formulário volta a ficar clean (ex.: reset() após salvar)', () => {
    const { rerender } = render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
      </UnsavedChangesProvider>,
    );

    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(dirtyEvent)).toBe(false);

    rerender(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty={false} />
      </UnsavedChangesProvider>,
    );

    const cleanEvent = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(cleanEvent)).toBe(true);
  });
});
