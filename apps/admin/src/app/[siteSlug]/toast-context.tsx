'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleCheckBig } from 'lucide-react';
import styles from './toast-context.module.css';

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Duração única do auto-dismiss — fonte única de verdade, nunca duplicada
 * como "magic number" pelos consumidores (`create-category.tsx`,
 * `category-detail.tsx` só chamam `showToast(mensagem)`, sem conhecer nem
 * precisar conhecer por quanto tempo o toast fica visível). Exportada
 * exclusivamente para o próprio spec deste módulo poder avançar timers
 * fake pelo valor exato, sem duplicar o número.
 */
export const TOAST_AUTO_DISMISS_MS = 4000;

/**
 * UXA-004 — mecanismo mínimo de notificação transitória de sucesso,
 * provado em Categoria (`UX-Implementation-Backlog.md`). Local ao Admin
 * por decisão desta rodada — `packages/ui` não é tocado nesta tarefa;
 * eventual promoção depende de reutilização real posterior (UXA-005/
 * UXA-013/UXA-015), mesmo princípio já aplicado em UXA-001
 * (`async-state.tsx`).
 *
 * Montado em `layout.tsx`, acima de `children` (a árvore roteada) — não
 * dentro de `categories/`. Isso é o que permite ao toast sobreviver a
 * `router.replace()` (ex.: criação de Categoria navegando para o
 * detalhe): o estado da mensagem vive neste Provider, que nunca desmonta
 * numa troca de rota dentro do mesmo `[siteSlug]`; só o conteúdo roteado
 * abaixo dele é substituído.
 *
 * Escopo deliberadamente mínimo (decisão aprovada para esta tarefa): uma
 * única mensagem de sucesso por vez, sem fila, sem notification center,
 * sem persistência entre sessões, sem ações nem botão de fechar — conteúdo
 * de sucesso é não crítico e desaparece sozinho.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setMessage(next);
    timeoutRef.current = setTimeout(() => {
      setMessage(null);
      timeoutRef.current = null;
    }, TOAST_AUTO_DISMISS_MS);
  }, []);

  // Timer pendente sobrevivendo ao desmonte do próprio Provider: nunca
  // dispara `setState` depois de desmontado.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/*
        `aria-live="polite"` + `aria-atomic="true"` montada de forma
        estável desde o primeiro render deste Provider — nunca condicionada
        a `message` existir. Leitores de tela só anunciam de forma
        confiável uma mudança de conteúdo dentro de uma live region que já
        existia no DOM antes da mudança acontecer; inserir o elemento
        `aria-live` junto do próprio texto arriscaria perder o anúncio.
        Quando `message` é `null`, a região permanece no DOM, só sem nó de
        texto — nunca é desmontada e remontada.
      */}
      <div aria-live="polite" aria-atomic="true" className={styles.liveRegion}>
        {message && (
          <div className={styles.toast}>
            {/*
              Ícone puramente decorativo: o texto já comunica o sucesso
              por si só ("Categoria salva."), então o ícone é redundante
              para tecnologia assistiva — `aria-hidden` o remove da árvore
              de acessibilidade. A cor nunca é o único sinal (texto + ícone
              juntos, nunca só a cor de fundo).
            */}
            <CircleCheckBig aria-hidden="true" className={styles.icon} />
            <span>{message}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Superfície pública mínima: só `showToast(message)`. Nenhuma duração,
 * dispensa manual ou fila é exposta a quem consome — mesma disciplina de
 * `useUnsavedChangesGuard` (UXA-003), que também expõe só o necessário.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast só pode ser usado dentro de ToastProvider.');
  }
  return context;
}
