'use client';

import { createContext, useContext } from 'react';
import type { Role } from '@commerce-platform/contracts';

const SiteRoleContext = createContext<Role | null>(null);

/**
 * Infraestrutura mínima de Role no frontend (ADM-012). `AuthenticatedShell`
 * é o único ponto que busca `/admin/auth/me` — este Context só propaga o
 * `role` do Site atual (já resolvido ali) para qualquer componente
 * descendente de `/:siteSlug/*`, sem novo fetch e sem prop drilling pelos
 * `page.tsx` (Server Components que só repassam `siteSlug`/`id`).
 *
 * Expõe só `Role` — nada de `siteId`/`sites`/estado de loading, que
 * continuam encapsulados em `AuthenticatedShell`.
 */
export const SiteRoleProvider = SiteRoleContext.Provider;

/**
 * Só pode ser chamado por um descendente de `AuthenticatedShell` dentro de
 * `<SiteRoleProvider>` — que só renderiza `children` depois de resolver a
 * Role com sucesso (nunca durante `loading`/`error`, ver `authenticated-shell.tsx`).
 * O `throw` documenta esse invariante estrutural em vez de devolver `null`
 * silenciosamente para quem esquecer o Provider.
 */
export function useSiteRole(): Role {
  const role = useContext(SiteRoleContext);
  if (role === null) {
    throw new Error('useSiteRole só pode ser usado dentro de AuthenticatedShell.');
  }
  return role;
}
