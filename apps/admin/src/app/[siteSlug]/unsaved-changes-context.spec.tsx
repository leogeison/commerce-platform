import { StrictMode, useEffect, useState } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { UnsavedChangesProvider, useSyncFormDirty, useUnsavedChangesGuard } from './unsaved-changes-context';

/**
 * Publica `isDirty` no Context via `useSyncFormDirty` — o mesmo mecanismo
 * que `CategoryForm`/`ProductForm`/`OfferForm` usam com `formState.isDirty`
 * da RHF, só que aqui controlado diretamente pelo teste, sem depender de
 * um formulário real. Cada instância monta seu PRÓPRIO publisher
 * (identidade interna via `useId()`, nunca exposta aqui) — vários
 * `DirtyPublisher` simultâneos simulam `ProductForm` + `OfferForm`
 * coexistindo (UXA-014), sem precisar montar nenhum dos dois de verdade.
 */
function DirtyPublisher({ isDirty }: { isDirty: boolean }) {
  useSyncFormDirty(isDirty);
  return null;
}

/**
 * Desmonta seu próprio `DirtyPublisher` sob demanda (botão "Desmontar
 * <label>") — usado para provar o comportamento de registro/remoção do
 * Context multi-publisher (UXA-014) sem expor `Map`/ids internos: só o
 * contrato observável (`isDirty` agregado, via `confirmLeave()`/
 * `beforeunload`) é testado.
 */
function ToggleablePublisher({ isDirty, label }: { isDirty: boolean; label: string }) {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      {mounted && <DirtyPublisher isDirty={isDirty} />}
      <button type="button" onClick={() => setMounted(false)}>
        Desmontar {label}
      </button>
    </>
  );
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

/**
 * Chama `confirmLeave(override)` — simula o uso real de `OfferSection`
 * (UXA-014): decidir a confirmação com base num booleano PRÓPRIO (dirty
 * local do `OfferForm` aberto), não no `isDirty` agregado do Context.
 *
 * Duas variantes, mesmo motivo já implícito em `ConfirmButton`/
 * `ConfirmProbe` acima: quando o teste deixa a confirmação pendente (abre
 * o diálogo e não a resolve antes do fim do teste — ex.: `override=true`),
 * usar a variante que ESCREVE no DOM após o `await` quebraria no
 * desmonte (o Provider resolve a pendência como `false` no cleanup, e o
 * `then` roda depois que o DOM já sumiu) — só a variante "dispara e
 * esquece" é segura nesse caso.
 */
function OverrideConfirmButton({ override }: { override: boolean }) {
  const { confirmLeave } = useUnsavedChangesGuard();
  return (
    <button
      type="button"
      onClick={() => {
        void confirmLeave(override);
      }}
    >
      Tentar trocar localmente
    </button>
  );
}

function OverrideConfirmProbe({ override }: { override: boolean }) {
  const { confirmLeave } = useUnsavedChangesGuard();
  return (
    <button
      type="button"
      onClick={async () => {
        const result = await confirmLeave(override);
        document.getElementById('result')!.textContent = String(result);
      }}
    >
      Tentar trocar localmente
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

  // --- UXA-014: multi-publisher (ProductForm + OfferForm coexistindo) ---
  // Só o contrato observável é exercitado (isDirty agregado via
  // confirmLeave()/beforeunload) — nenhum teste acessa Map, ids ou
  // qualquer API interna do Provider.

  it('dois publishers (um dirty, um clean): isDirty agregado é true — confirmLeave() abre o diálogo', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
        <DirtyPublisher isDirty={false} />
        <ConfirmButton />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('dois publishers, ambos clean: isDirty agregado é false — confirmLeave() resolve true sem diálogo', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty={false} />
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

  it('dois publishers, ambos dirty: isDirty agregado é true', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
        <DirtyPublisher isDirty />
        <ConfirmButton />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('três publishers simultâneos (só um dirty): isDirty agregado é true (cobre múltiplos OfferForm, mesmo que a UI restrinja depois)', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty={false} />
        <DirtyPublisher isDirty />
        <DirtyPublisher isDirty={false} />
        <ConfirmButton />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('publisher dirty desmonta sendo o único dirty: isDirty agregado vira false', async () => {
    render(
      <UnsavedChangesProvider>
        <ToggleablePublisher isDirty label="A" />
        <ConfirmProbe />
        <p id="result" />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Desmontar A' }));
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(document.getElementById('result')).toHaveTextContent('true'));
  });

  it('publisher dirty desmonta havendo outro publisher dirty: isDirty agregado permanece true', async () => {
    render(
      <UnsavedChangesProvider>
        <ToggleablePublisher isDirty label="A" />
        <DirtyPublisher isDirty />
        <ConfirmButton />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Desmontar A' }));
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('publisher clean desmonta havendo outro publisher dirty: isDirty agregado permanece true', async () => {
    render(
      <UnsavedChangesProvider>
        <ToggleablePublisher isDirty={false} label="A" />
        <DirtyPublisher isDirty />
        <ConfirmButton />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Desmontar A' }));
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('confirmLeave(true): abre o diálogo mesmo com o isDirty agregado do Context sendo false', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty={false} />
        <OverrideConfirmButton override />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar trocar localmente' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('confirmLeave(false): resolve true sem abrir o diálogo mesmo com o isDirty agregado do Context sendo true', async () => {
    render(
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty />
        <OverrideConfirmProbe override={false} />
        <p id="result" />
      </UnsavedChangesProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar trocar localmente' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(document.getElementById('result')).toHaveTextContent('true'));
  });

  it('beforeunload: continua correto quando um publisher fica clean e outro fica dirty ao mesmo tempo (transição, sem "buraco" de proteção)', () => {
    function TwoPublishers({ aDirty, bDirty }: { aDirty: boolean; bDirty: boolean }) {
      return (
        <>
          <DirtyPublisher isDirty={aDirty} />
          <DirtyPublisher isDirty={bDirty} />
        </>
      );
    }

    const { rerender } = render(
      <UnsavedChangesProvider>
        <TwoPublishers aDirty bDirty={false} />
      </UnsavedChangesProvider>,
    );

    const firstEvent = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(firstEvent)).toBe(false);

    rerender(
      <UnsavedChangesProvider>
        <TwoPublishers aDirty={false} bDirty />
      </UnsavedChangesProvider>,
    );

    const secondEvent = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(secondEvent)).toBe(false);
  });

  it('mesma instância alternando isDirty repetidamente: id estável não deixa entradas fantasmas (agregado sempre reflete o valor atual)', async () => {
    const tree = (isDirty: boolean) => (
      <UnsavedChangesProvider>
        <DirtyPublisher isDirty={isDirty} />
        <ConfirmProbe />
        <p id="result" />
      </UnsavedChangesProvider>
    );

    const { rerender } = render(tree(true));
    rerender(tree(false));
    rerender(tree(true));
    rerender(tree(false));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(document.getElementById('result')).toHaveTextContent('true'));
  });

  it('Strict Mode: um publisher dirty ainda resulta em isDirty agregado observável (contrato preservado sob remount sintético)', async () => {
    render(
      <StrictMode>
        <UnsavedChangesProvider>
          <DirtyPublisher isDirty />
          <ConfirmButton />
        </UnsavedChangesProvider>
      </StrictMode>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
