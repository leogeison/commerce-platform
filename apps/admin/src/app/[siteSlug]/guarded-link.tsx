'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps, ReactNode } from 'react';
import { useUnsavedChangesGuard } from './unsaved-changes-context';

type GuardedLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate'> & {
  href: string;
  children: ReactNode;
};

/**
 * `Link` do Next.js com um único acréscimo: antes de completar a
 * navegação, consulta `useUnsavedChangesGuard()`. Usa `onNavigate` (API
 * estável desde o Next.js 15.3, presente em 16.2 — verificado na
 * documentação oficial da versão instalada) em vez de um listener global
 * de `click`: `onNavigate` já não dispara para clique com
 * modificador (Cmd/Ctrl — o navegador abre nova aba), link externo ou
 * `download` — nenhum desses precisa de tratamento manual aqui, o próprio
 * Next já exclui esses casos. Um listener global exigiria reimplementar
 * essas exclusões à mão e passaria a interceptar qualquer `<a>` futuro
 * montado na mesma página, mesmo sem relação com este guard.
 *
 * Sem alteração não salva (`isDirty === false`), o comportamento é
 * idêntico a um `Link` comum. Só com alteração pendente a navegação é
 * interrompida (`preventDefault`) e refeita manualmente após
 * `confirmLeave()` resolver `true`.
 */
export function GuardedLink({ href, replace, children, ...rest }: GuardedLinkProps) {
  const router = useRouter();
  const { isDirty, confirmLeave } = useUnsavedChangesGuard();

  return (
    <Link
      href={href}
      replace={replace}
      onNavigate={(event) => {
        if (!isDirty) {
          return;
        }
        event.preventDefault();
        void confirmLeave().then((canLeave) => {
          if (!canLeave) {
            return;
          }
          if (replace) {
            router.replace(href);
          } else {
            router.push(href);
          }
        });
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
