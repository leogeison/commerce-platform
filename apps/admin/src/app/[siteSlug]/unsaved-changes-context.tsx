'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './unsaved-changes-context.module.css';

interface UnsavedChangesContextValue {
  isDirty: boolean;
  confirmLeave: (isDirtyOverride?: boolean) => Promise<boolean>;
}

interface UnsavedChangesInternalValue extends UnsavedChangesContextValue {
  registerBlocker: (id: string, blocking: boolean) => void;
  unregisterBlocker: (id: string) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesInternalValue | null>(null);

/**
 * `useLayoutEffect` não roda durante SSR (Next.js pré-renderiza os Client
 * Components deste app) e emite aviso de console nesse caso — troca para
 * `useEffect` no servidor (mesmo idioma já usado por outras bibliotecas
 * para "layout effect" seguro em SSR); no cliente continua síncrono
 * pós-commit, como pedido.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * UXA-014 — evoluído de single-publisher (só `CategoryForm` ou só
 * `ProductForm`, nunca dois ao mesmo tempo) para MULTI-publisher:
 * `ProductForm` e `OfferForm` agora coexistem na mesma árvore (Oferta
 * embutida no detalhe do Produto, sem rota própria — Architecture.md
 * §32), e mais de um `OfferForm` pode existir simultaneamente mesmo que a
 * UI atual (`OfferSection`, UXA-014) restrinja a coexistência a um só
 * formulário inline por vez — a infraestrutura não depende dessa
 * restrição de UI para ficar correta, porque a garantia é estrutural
 * (registro por id), não por contagem de instâncias esperadas.
 *
 * `isDirty` público passa a ser DERIVADO, nunca mais escrito diretamente:
 * cada chamador de `useSyncFormDirty` (identificado por um id interno
 * estável, nunca inventado pelo chamador — ver `useSyncFormDirty` abaixo)
 * publica seu próprio booleano em `blockersRef` (`Map<string, boolean>`,
 * mutável, fora de render); o `isDirty` do Context é sempre o OR de todos
 * os valores atualmente registrados. Um publisher que desmonta é REMOVIDO
 * do registro (`unregisterBlocker`) — nunca "reportado como false" por cima
 * do que os outros publicaram. Essa distinção resolve exatamente o bug
 * que motivou esta mudança (UXA-014, investigação): antes, com um único
 * `isDirty` escrito diretamente, um segundo publisher limpo (`isDirty =
 * false`, ex.: abrir um `OfferForm` recém-montado) sobrescrevia
 * incondicionalmente o valor já publicado por um primeiro publisher sujo
 * (ex.: `ProductForm` com edição não salva) — o guard de navegação
 * "esquecia" que ainda havia algo não salvo. Com registro por id e OR
 * agregado, cada publisher só afeta sua própria entrada; remover uma
 * entrada `false` nunca muda o agregado, e remover a última entrada
 * `true` é o único jeito de o agregado voltar a `false`.
 *
 * `useSyncFormDirty(isDirty)` mantém a MESMA assinatura pública de antes
 * desta tarefa — nenhum consumidor existente (`CategoryForm`/
 * `ProductForm`) precisa mudar uma linha. A identidade (`useId()`, React
 * 19, estável por instância de componente — inclusive sob o
 * mount/unmount/remount sintético do Strict Mode, que sempre converge
 * para uma única entrada final por instância, nunca duplica) é obtida
 * dentro do próprio hook, nunca fornecida pelo chamador.
 *
 * `confirmLeave` ganha um parâmetro opcional (`isDirtyOverride`) — ver seu
 * próprio doc comment abaixo. Nenhuma outra API pública muda.
 *
 * UXE-008 — o registro interno era nomeado só em termos de "dirty" porque,
 * até esta tarefa, só existia um tipo de publisher (dirty-state, UXA-003/
 * UXA-014). UXE-008 introduz um segundo publisher semanticamente distinto
 * (`useSyncPendingSave`, pending-save do autosave de `bodyMdx`) que NÃO é
 * dirty-state — o backlog é explícito que autosave usa "mecanismo
 * diferente, não reaproveitado" do dirty-state guard. Os identificadores
 * privados (`registerBlocker`/`unregisterBlocker`/`blockersRef`, antes
 * `registerDirty`/`unregisterDirty`/`publishersRef`) foram renomeados para
 * refletir o que o registro estrutural sempre foi: um agregador OR de
 * "algo aqui bloquearia a saída", neutro quanto ao MOTIVO de cada entrada
 * (edição não salva vs. salvamento pendente/falho). Nenhum comportamento
 * muda com o rename — só os nomes internos, nunca expostos fora deste
 * módulo. `useSyncFormDirty` continua com a mesma assinatura/semântica
 * pública de sempre; `useSyncPendingSave` (abaixo) é o novo publisher
 * simétrico, com seu próprio id e seu próprio motivo de existir, ambos
 * compartilhando o mesmo registro/diálogo/`confirmLeave`/`beforeunload` —
 * a MESMA pergunta de navegação ("há algo não salvo?"), agora alimentada
 * por duas fontes distintas e semanticamente independentes.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const blockersRef = useRef<Map<string, boolean>>(new Map());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingResolveRef = useRef<((canLeave: boolean) => void) | null>(null);
  const pendingPromiseRef = useRef<Promise<boolean> | null>(null);

  /**
   * Único ponto que recalcula o agregado a partir do registro completo —
   * chamado depois de qualquer `set`/`delete` em `blockersRef`, nunca
   * inferido incrementalmente (mais simples e sem risco de o agregado
   * divergir do registro real).
   */
  const recomputeIsDirty = useCallback(() => {
    let next = false;
    for (const value of blockersRef.current.values()) {
      if (value) {
        next = true;
        break;
      }
    }
    setIsDirty(next);
  }, []);

  const registerBlocker = useCallback(
    (id: string, blocking: boolean) => {
      blockersRef.current.set(id, blocking);
      recomputeIsDirty();
    },
    [recomputeIsDirty],
  );

  const unregisterBlocker = useCallback(
    (id: string) => {
      blockersRef.current.delete(id);
      recomputeIsDirty();
    },
    [recomputeIsDirty],
  );

  const resolvePending = useCallback((canLeave: boolean) => {
    pendingResolveRef.current?.(canLeave);
    pendingResolveRef.current = null;
    pendingPromiseRef.current = null;
  }, []);

  /**
   * `isDirtyOverride` (UXA-014) — permite a um chamador decidir com base
   * num booleano PRÓPRIO em vez do `isDirty` agregado do Context inteiro.
   * Motivo: `OfferSection` precisa perguntar "você vai perder o que
   * digitou NESTE formulário de Oferta?" ao trocar localmente entre
   * criar/editar — uma pergunta sobre UM publisher específico, não sobre
   * "existe algo não salvo em QUALQUER lugar da página" (que é o que o
   * agregado responde, e é a pergunta certa só para navegação real). Sem
   * o override, `ProductForm` sujo faria essa troca local perguntar por
   * um motivo alheio a ela — e a resposta do usuário não afetaria em nada
   * a sujeira real do Produto.
   *
   * Omitido (todo consumidor já existente: `GuardedLink`, troca de
   * Site/Logout em `authenticated-shell.tsx`, navegação do
   * `CommandPalette`), o comportamento é IDÊNTICO ao de antes desta
   * tarefa: usa o `isDirty` agregado do Context. Fornecido, substitui
   * inteiramente essa fonte para aquela chamada. Em ambos os casos é o
   * MESMO diálogo, a MESMA Promise, o MESMO mecanismo de resolução — não
   * é um segundo sistema de confirmação, só uma fonte alternativa para a
   * mesma pergunta.
   */
  const confirmLeave = useCallback(
    (isDirtyOverride?: boolean): Promise<boolean> => {
      const dirty = isDirtyOverride ?? isDirty;
      if (!dirty) {
        return Promise.resolve(true);
      }
      if (pendingPromiseRef.current) {
        return pendingPromiseRef.current;
      }
      const promise = new Promise<boolean>((resolve) => {
        pendingResolveRef.current = resolve;
      });
      pendingPromiseRef.current = promise;
      // `showModal()` NÃO reseta `returnValue` sozinho (comportamento real
      // da spec, confirmado empiricamente) — sem este reset, um Escape
      // numa apresentação nova do diálogo poderia ler um `returnValue`
      // remanescente de um "Sair sem salvar" de uma apresentação anterior
      // e resolver `true` por engano. Cada apresentação começa limpa.
      if (dialogRef.current) {
        dialogRef.current.returnValue = '';
      }
      dialogRef.current?.showModal();
      return promise;
    },
    [isDirty],
  );

  // Confirmação pendente sobrevivendo ao desmonte do próprio Provider:
  // resolve `false` (não deixa a Promise pendurada para sempre).
  useEffect(() => {
    return () => {
      resolvePending(false);
    };
  }, [resolvePending]);

  /**
   * `beforeunload` cobre o que `GuardedLink`/`confirmLeave()` não cobrem:
   * unload real do documento (refresh, fechar aba/janela, digitar uma URL,
   * link externo) — soft navigation dentro do app nunca passa por aqui.
   * O listener só existe enquanto `isDirty` (agregado) é `true`: o efeito
   * depende de `isDirty` e o `return` cleanup remove o listener sempre que
   * `isDirty` muda (inclusive de `true` para `false`, ex.: depois de
   * `reset(data)` numa submissão bem-sucedida, ou quando o último
   * publisher sujo desmonta) ou no unmount — nunca fica um listener
   * "esquecido" ativo com tudo limpo.
   *
   * Sem mensagem customizada de propósito: navegadores modernos ignoram
   * qualquer string fornecida e mostram só o diálogo nativo do próprio
   * browser — essa UI não é substituível pelo `<dialog>` usado nas soft
   * navigations. `preventDefault()` é o gatilho padrão; `returnValue` é
   * mantido só por compatibilidade com engines mais antigas que ainda
   * dependem dele para acionar o prompt nativo.
   */
  useEffect(() => {
    if (!isDirty) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  /**
   * Único ponto que resolve a Promise pendente — Confirmar, Cancelar e
   * Escape convergem todos aqui via `returnValue` nativo do `<dialog>`:
   * os dois botões só chamam `close(returnValue)`; Escape aciona o
   * fechamento nativo do navegador (evento `cancel` seguido de `close`)
   * sem passar por nenhum botão, deixando `returnValue` no valor anterior
   * (vazio) — tratado como "Ficar", o padrão seguro.
   */
  function handleDialogClose() {
    resolvePending(dialogRef.current?.returnValue === 'leave');
  }

  return (
    <UnsavedChangesContext.Provider value={{ isDirty, confirmLeave, registerBlocker, unregisterBlocker }}>
      {children}
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="unsaved-changes-title"
        onClose={handleDialogClose}
      >
        <h2 id="unsaved-changes-title" className={styles.title}>
          Alterações não salvas
        </h2>
        <p className={styles.message}>Você tem alterações não salvas. Deseja sair mesmo assim?</p>
        <div className={styles.actions}>
          {/* Foco inicial na ação segura — evita perder edição por um Enter acidental. */}
          <button type="button" autoFocus onClick={() => dialogRef.current?.close('stay')}>
            Ficar
          </button>
          <button type="button" onClick={() => dialogRef.current?.close('leave')}>
            Sair sem salvar
          </button>
        </div>
      </dialog>
    </UnsavedChangesContext.Provider>
  );
}

/**
 * Superfície pública mínima — só `isDirty` (leitura síncrona, necessária
 * para `GuardedLink` decidir se chama `preventDefault()` em `onNavigate`)
 * e `confirmLeave`. `registerBlocker`/`unregisterBlocker` não são expostos
 * aqui de propósito: só `useSyncFormDirty`/`useSyncPendingSave` têm acesso
 * a eles.
 */
export function useUnsavedChangesGuard(): UnsavedChangesContextValue {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useUnsavedChangesGuard só pode ser usado dentro de UnsavedChangesProvider.');
  }
  return context;
}

/**
 * Publica `formState.isDirty` da RHF (chamado por `CategoryForm`/
 * `ProductForm`/`OfferForm`, UXA-014) para o Context — identidade obtida
 * via `useId()`, nunca fornecida pelo chamador; a assinatura pública
 * (`useSyncFormDirty(isDirty)`) é a mesma de antes desta tarefa.
 *
 * Dois efeitos deliberadamente separados, mesma razão já documentada
 * antes desta tarefa:
 *
 * - o primeiro (síncrono, pós-commit) publica o valor atual a cada
 *   mudança de `id`/`isDirty` — é só isso, nunca faz cleanup;
 * - o segundo não depende de `isDirty` (só de `id`/`unregisterBlocker`,
 *   estáveis) — seu cleanup roda exclusivamente no desmonte real do
 *   componente chamador, nunca como reação a uma mudança de `isDirty`
 *   durante a vida dele, e remove SÓ a entrada deste publisher do
 *   registro — nunca zera o `isDirty` dos demais publishers ainda
 *   montados. Se os dois estivessem no mesmo efeito, o cleanup rodaria
 *   antes de cada nova execução (isto é, a cada mudança de `isDirty`), não
 *   só no unmount — exatamente o bug que este desenho evita.
 */
export function useSyncFormDirty(isDirty: boolean): void {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useSyncFormDirty só pode ser usado dentro de UnsavedChangesProvider.');
  }
  const { registerBlocker, unregisterBlocker } = context;
  const id = useId();

  useIsomorphicLayoutEffect(() => {
    registerBlocker(id, isDirty);
  }, [id, isDirty, registerBlocker]);

  useEffect(() => {
    return () => {
      unregisterBlocker(id);
    };
  }, [id, unregisterBlocker]);
}

/**
 * UXE-008 — segundo publisher do mesmo registro neutro (Opção B aprovada),
 * semanticamente distinto de `useSyncFormDirty`: publica se há um
 * salvamento automático de `bodyMdx` pendente/em voo OU uma falha ainda
 * não resolvida (`isPendingOrFailed`), nunca "dirty" no sentido de
 * formulário com edição não submetida. O backlog é explícito que UXE-008
 * usa "mecanismo diferente, não reaproveitado" do dirty-state guard de
 * UXA-003 — por isso este é um publisher próprio, com seu próprio id
 * (`useId()`), nunca uma chamada a `useSyncFormDirty` por baixo.
 *
 * Compartilha deliberadamente com `useSyncFormDirty` o mesmo registro
 * agregado (OR), o mesmo diálogo, o mesmo `confirmLeave` e o mesmo
 * `beforeunload` — o backlog não proíbe reaproveitar a MÁQUINA de
 * navegação (diálogo/roteamento), só a CONDIÇÃO semântica de dirty-state.
 * Perguntar "há algo que bloquearia a saída agora?" continua sendo uma
 * única pergunta de navegação, agora alimentada por duas fontes
 * independentes: uma edição de formulário não salva (`useSyncFormDirty`)
 * e um salvamento automático pendente/falho (`useSyncPendingSave`) — o
 * agregado OR trata as duas exatamente como trata dois `useSyncFormDirty`
 * simultâneos (`ProductForm` + `OfferForm`, UXA-014): qualquer uma sendo
 * `true` basta para bloquear.
 *
 * Mesma estrutura de dois efeitos separados de `useSyncFormDirty`, pela
 * mesma razão: publicar a cada mudança nunca faz cleanup; desregistrar só
 * no desmonte real do chamador.
 */
export function useSyncPendingSave(isPendingOrFailed: boolean): void {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useSyncPendingSave só pode ser usado dentro de UnsavedChangesProvider.');
  }
  const { registerBlocker, unregisterBlocker } = context;
  const id = useId();

  useIsomorphicLayoutEffect(() => {
    registerBlocker(id, isPendingOrFailed);
  }, [id, isPendingOrFailed, registerBlocker]);

  useEffect(() => {
    return () => {
      unregisterBlocker(id);
    };
  }, [id, unregisterBlocker]);
}
