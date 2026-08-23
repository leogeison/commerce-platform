'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './unsaved-changes-context.module.css';

interface UnsavedChangesContextValue {
  isDirty: boolean;
  confirmLeave: () => Promise<boolean>;
}

interface UnsavedChangesInternalValue extends UnsavedChangesContextValue {
  reportDirty: (isDirty: boolean) => void;
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
 * `formState.isDirty` do `react-hook-form` (UXA-002) continua sendo a
 * única autoridade semântica de dirty-state do formulário de Categoria —
 * este Context nunca fabrica ou sobrescreve esse valor de forma
 * independente. Ele existe só para publicar/coordenar esse mesmo valor
 * para consumidores fora da árvore do formulário (`GuardedLink`, troca de
 * Site e Logout em `authenticated-shell.tsx`), que não têm acesso direto
 * ao `useForm()` de `CategoryForm`.
 *
 * `reportDirty` é o único caminho de escrita de `isDirty` — usado
 * exclusivamente por `useSyncFormDirty` (chamado dentro de `CategoryForm`,
 * espelhando `formState.isDirty`). Nenhum outro código deste app grava
 * nesse valor; não existe um "markClean()" ou equivalente que finja um
 * estado limpo independente da RHF.
 *
 * Não há registro de múltiplos formulários — só existe uma instância de
 * `CategoryForm` montada por vez nas telas atuais de Categoria, então um
 * único par isDirty/confirmLeave é suficiente; não é um framework de
 * formulários genérico.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingResolveRef = useRef<((canLeave: boolean) => void) | null>(null);
  const pendingPromiseRef = useRef<Promise<boolean> | null>(null);

  const reportDirty = useCallback((next: boolean) => {
    setIsDirty(next);
  }, []);

  const resolvePending = useCallback((canLeave: boolean) => {
    pendingResolveRef.current?.(canLeave);
    pendingResolveRef.current = null;
    pendingPromiseRef.current = null;
  }, []);

  /**
   * Sem `isDirty` no momento da chamada: resolve `true` de imediato, sem
   * abrir o `<dialog>`. Com uma confirmação já em aberto (segunda
   * tentativa enquanto o usuário ainda não respondeu): devolve a mesma
   * Promise em vez de empilhar um segundo diálogo — não há fila.
   */
  const confirmLeave = useCallback((): Promise<boolean> => {
    if (!isDirty) {
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
  }, [isDirty]);

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
   * O listener só existe enquanto `isDirty` é `true`: o efeito depende de
   * `isDirty` e o `return` cleanup remove o listener sempre que `isDirty`
   * muda (inclusive de `true` para `false`, ex.: depois de `reset(data)`
   * numa submissão bem-sucedida) ou no unmount — nunca fica um listener
   * "esquecido" ativo com o formulário limpo.
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
    <UnsavedChangesContext.Provider value={{ isDirty, confirmLeave, reportDirty }}>
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
 * e `confirmLeave`. `reportDirty` não é exposto aqui de propósito: só
 * `useSyncFormDirty` tem acesso a ele.
 */
export function useUnsavedChangesGuard(): UnsavedChangesContextValue {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useUnsavedChangesGuard só pode ser usado dentro de UnsavedChangesProvider.');
  }
  return context;
}

/**
 * Publica `formState.isDirty` da RHF (chamado por `CategoryForm`) para o
 * Context. Dois efeitos deliberadamente separados:
 *
 * - o primeiro (síncrono, pós-commit) publica o valor atual a cada
 *   mudança de `isDirty` — é só isso, nunca faz cleanup;
 * - o segundo não depende de `isDirty` (só de `reportDirty`, estável) —
 *   seu cleanup roda exclusivamente no desmonte real do componente
 *   chamador, nunca como reação a uma mudança de `isDirty` durante a vida
 *   dele. Se os dois estivessem no mesmo efeito, o cleanup rodaria antes
 *   de cada nova execução (isto é, a cada mudança de `isDirty`), não só no
 *   unmount — exatamente o bug que este desenho evita.
 */
export function useSyncFormDirty(isDirty: boolean): void {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useSyncFormDirty só pode ser usado dentro de UnsavedChangesProvider.');
  }
  const { reportDirty } = context;

  useIsomorphicLayoutEffect(() => {
    reportDirty(isDirty);
  }, [isDirty, reportDirty]);

  useEffect(() => {
    return () => {
      reportDirty(false);
    };
  }, [reportDirty]);
}
