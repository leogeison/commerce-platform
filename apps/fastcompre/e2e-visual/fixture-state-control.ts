/**
 * apps/fastcompre/e2e-visual/fixture-state-control.ts
 *
 * UXW-015 — ponte Node-side (nunca via `page`/navegador) entre os specs e o
 * mock (`mock-public-api.mjs`) + o endpoint de revalidação real do
 * FastCompre (`apps/fastcompre/src/app/api/internal/revalidate/route.ts`).
 *
 * POR QUE A REVALIDAÇÃO É NECESSÁRIA: `(home)/page.tsx` e
 * `[categorySlug]/page.tsx` declaram `export const fetchCache =
 * 'force-cache'` — o `fetch()` de `listPublicArticles` fica cacheado no
 * Data Cache do Next, por URL exata, durante toda a vida do processo
 * `next start`. Sem invalidar esse cache, alternar o estado do mock entre
 * `populated`/`empty` não teria efeito na segunda navegação para a mesma
 * URL (Home nunca varia por querystring entre os dois estados). A correção
 * não é um hack de teste: é o MESMO mecanismo que a API real usa em
 * produção para refletir mudança de conteúdo —
 * `POST /api/internal/revalidate`, autenticado por
 * `x-revalidation-secret` (`REVALIDATION_SECRET`), que já chama
 * `revalidatePath('/', 'layout')` incondicionalmente. Nenhum código novo
 * foi adicionado a `apps/fastcompre/src` para isso.
 *
 * `resetFixtureState` é chamado no início de TODO teste (mesmo quando o
 * estado não muda de fato) — cada teste fica auto-suficiente e independente
 * da ordem de execução entre arquivos, em vez de depender implicitamente do
 * que o teste anterior deixou configurado.
 */
import {
  MOCK_PUBLIC_API_ORIGIN,
  FASTCOMPRE_BASE_URL,
  SITE_SLUG,
  REVALIDATION_SECRET,
  REVALIDATION_SECRET_HEADER,
} from './fixtures.mjs';

export type FixtureState = 'populated' | 'empty';

async function setMockFixtureState(state: FixtureState): Promise<void> {
  const response = await fetch(`${MOCK_PUBLIC_API_ORIGIN}/__test-control__/fixture-state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state }),
  });
  if (!response.ok) {
    throw new Error(`[fixture-state-control] falha ao definir estado do mock: ${response.status}`);
  }
}

async function revalidateFastcompre(): Promise<void> {
  const response = await fetch(`${FASTCOMPRE_BASE_URL}/api/internal/revalidate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [REVALIDATION_SECRET_HEADER]: REVALIDATION_SECRET,
    },
    body: JSON.stringify({ siteSlug: SITE_SLUG }),
  });
  if (!response.ok) {
    throw new Error(`[fixture-state-control] falha ao revalidar o FastCompre: ${response.status}`);
  }
}

/**
 * Define o estado do mock e força o FastCompre a descartar qualquer
 * resposta cacheada (`fetchCache: 'force-cache'`) antes do próximo
 * `page.goto()`. Chamado no início de cada teste, nunca só quando o estado
 * muda — mantém os 5 testes independentes de ordem.
 */
export async function resetFixtureState(state: FixtureState): Promise<void> {
  await setMockFixtureState(state);
  await revalidateFastcompre();
}
