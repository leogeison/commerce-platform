/**
 * apps/admin/src/app/[siteSlug]/articles/product-lookup-context.spec.tsx
 *
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição.
 *
 * Cobertura de `ProductLookupProvider`/`useProductLookup` isolada dos
 * consumidores reais (`ArticleProductsSection`, decorator do
 * `ProductBlockNode`, `ArticleBodyProductFlow`, preview) — cada um deles
 * já tem sua própria suíte cobrindo o comportamento visível através de si
 * mesmo; esta suíte cobre a fonte compartilhada em si: combinação de
 * estados, `resolveProduct`, `linkedProducts`, `setProductIds` e o valor
 * default "indisponível" sem `Provider`.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { useProductLookup, ProductLookupProvider, type ProductLookupContextValue } from './product-lookup-context';

const SITE_SLUG = 'fastcompre';
const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PRODUCT_NAME = 'Fone Bluetooth';
const OTHER_PRODUCT_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

function makeProduct(id: string, name: string) {
  return {
    id,
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    name,
    slug: name.toLowerCase(),
    description: null,
    imageUrl: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function catalogResponse(items: ReturnType<typeof makeProduct>[]) {
  return jsonResponse(200, { items, page: 1, pageSize: 100, total: items.length, totalPages: 1 });
}

describe('ProductLookupContext — sem Provider', () => {
  it('valor default é "unavailable", nunca lança — necessário para composições existentes (ArticleForm) que renderizam sem Provider', () => {
    const { result } = renderHook(() => useProductLookup());

    expect(result.current.articleId).toBeNull();
    expect(result.current.overallStatus).toBe('unavailable');
    expect(result.current.linkedProducts).toEqual([]);
    expect(result.current.resolveProduct(PRODUCT_ID)).toEqual({ status: 'unavailable' });
    // setProductIds é um no-op seguro — nunca lança mesmo sem Provider.
    expect(() => result.current.setProductIds([PRODUCT_ID])).not.toThrow();
  });
});

describe('ProductLookupProvider — articleId === null (/articles/new)', () => {
  it('nunca dispara fetch; overallStatus permanece "unavailable"', () => {
    const fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock;

    const { result } = renderHook(() => useProductLookup(), {
      wrapper: ({ children }) => (
        <ProductLookupProvider siteSlug={SITE_SLUG} articleId={null}>
          {children}
        </ProductLookupProvider>
      ),
    });

    expect(result.current.overallStatus).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ProductLookupProvider — articleId real', () => {
  it('loading enquanto qualquer uma das duas buscas está pendente', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useProductLookup(), {
      wrapper: ({ children }) => (
        <ProductLookupProvider siteSlug={SITE_SLUG} articleId={ARTICLE_ID}>
          {children}
        </ProductLookupProvider>
      ),
    });

    expect(result.current.overallStatus).toBe('loading');
    expect(result.current.resolveProduct(PRODUCT_ID)).toEqual({ status: 'loading' });
  });

  it('error se QUALQUER uma das duas buscas falhar — mesma combinação já usada por ArticleProductsSection antes desta tarefa', async () => {
    global.fetch = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/products')) {
        return jsonResponse(500, { unexpected: 'shape' });
      }
      return catalogResponse([makeProduct(PRODUCT_ID, PRODUCT_NAME)]);
    });

    const { result } = renderHook(() => useProductLookup(), {
      wrapper: ({ children }) => (
        <ProductLookupProvider siteSlug={SITE_SLUG} articleId={ARTICLE_ID}>
          {children}
        </ProductLookupProvider>
      ),
    });

    await waitFor(() => expect(result.current.overallStatus).toBe('error'));
    expect(result.current.resolveProduct(PRODUCT_ID)).toEqual({ status: 'error' });
  });

  it('ready: linkedProducts resolvido na ordem de productIds; resolveProduct devolve o Produto para um id vinculado', async () => {
    global.fetch = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [PRODUCT_ID] });
      }
      return catalogResponse([makeProduct(OTHER_PRODUCT_ID, 'Outro'), makeProduct(PRODUCT_ID, PRODUCT_NAME)]);
    });

    const { result } = renderHook(() => useProductLookup(), {
      wrapper: ({ children }) => (
        <ProductLookupProvider siteSlug={SITE_SLUG} articleId={ARTICLE_ID}>
          {children}
        </ProductLookupProvider>
      ),
    });

    await waitFor(() => expect(result.current.overallStatus).toBe('ready'));
    expect(result.current.linkedProducts.map((p) => p.id)).toEqual([PRODUCT_ID]);
    expect(result.current.resolveProduct(PRODUCT_ID)).toEqual({
      status: 'ready',
      product: expect.objectContaining({ id: PRODUCT_ID, name: PRODUCT_NAME }),
    });
  });

  it('ready: resolveProduct devolve "not-found" para um productId real porém NÃO vinculado a este Artigo — nunca fallback para outro Produto (Contract §5)', async () => {
    global.fetch = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [] });
      }
      return catalogResponse([makeProduct(OTHER_PRODUCT_ID, 'Outro')]);
    });

    const { result } = renderHook(() => useProductLookup(), {
      wrapper: ({ children }) => (
        <ProductLookupProvider siteSlug={SITE_SLUG} articleId={ARTICLE_ID}>
          {children}
        </ProductLookupProvider>
      ),
    });

    await waitFor(() => expect(result.current.overallStatus).toBe('ready'));
    expect(result.current.resolveProduct(OTHER_PRODUCT_ID)).toEqual({ status: 'not-found' });
  });

  it('setProductIds atualiza a fonte compartilhada diretamente (sem novo fetch) — mesmo contrato usado pelas mutações de ArticleProductsSection', async () => {
    const fetchMock = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [] });
      }
      return catalogResponse([makeProduct(PRODUCT_ID, PRODUCT_NAME)]);
    });
    global.fetch = fetchMock;

    const { result } = renderHook(() => useProductLookup(), {
      wrapper: ({ children }) => (
        <ProductLookupProvider siteSlug={SITE_SLUG} articleId={ARTICLE_ID}>
          {children}
        </ProductLookupProvider>
      ),
    });

    await waitFor(() => expect(result.current.overallStatus).toBe('ready'));
    expect(result.current.linkedProducts).toHaveLength(0);

    const callsBeforeUpdate = fetchMock.mock.calls.length;
    act(() => {
      result.current.setProductIds([PRODUCT_ID]);
    });

    await waitFor(() => expect(result.current.linkedProducts.map((p) => p.id)).toEqual([PRODUCT_ID]));
    // Nenhum novo fetch disparado por `setProductIds` — a UXE-011 fecha
    // explicitamente contra `refreshToken`/polling/invalidação.
    expect(fetchMock.mock.calls.length).toBe(callsBeforeUpdate);
  });
});

/**
 * UXE-011 — rodada de correção pós-suíte global: `ProductLookupProvider`
 * NÃO tem garantia de remontar quando `siteSlug`/`articleId` mudam (ver
 * doc comment de `product-lookup-context.tsx`). Os testes abaixo usam
 * `rerender` (mesma instância do Provider, `siteSlug`/`articleId` mudam
 * via props) para comprovar que nenhum dado do Artigo/Site anterior fica
 * observável durante/depois da troca.
 *
 * CORREÇÃO (rodada de harness pós-lint) — `renderHook` (`@testing-library/
 * react` 16.1.0 instalado) tem `wrapper` tipado para aceitar só
 * `{ children: ReactNode }`: `initialProps`/props passadas a `rerender`
 * NUNCA chegam a `wrapper` (confirmado: era a causa raiz de
 * `deferred['products-1'] is not a function` e do segundo teste terminar
 * em `overallStatus === 'error'` — o `Provider` sempre recebia
 * `siteSlug`/`articleId` `undefined`, então as URLs geradas nunca batiam
 * com nenhum branch do mock e o "rótulo" correspondente nunca era
 * populado). Os dois testes abaixo usam `render`/`rerender` diretamente
 * sobre uma sonda (`LookupProbe`) que expõe o valor do hook via callback,
 * em vez de `renderHook` — a MESMA técnica de reconciliação usada em
 * produção (`[id]/page.tsx` → `<ArticleDetail>`, sem `key`): o mesmo tipo
 * de elemento (`ProductLookupProvider`) na mesma posição entre um
 * `render` e um `rerender` é reconciliado como a MESMA instância, nunca
 * remontado — exatamente o cenário que este bloco precisa comprovar.
 */

function LookupProbe({ onValue }: { onValue: (value: ProductLookupContextValue) => void }) {
  const value = useProductLookup();
  onValue(value);
  return null;
}

function renderLookup(props: { siteSlug: string; articleId: string | null }) {
  let latest!: ProductLookupContextValue;
  const capture = (value: ProductLookupContextValue) => {
    latest = value;
  };
  const view = render(
    <ProductLookupProvider siteSlug={props.siteSlug} articleId={props.articleId}>
      <LookupProbe onValue={capture} />
    </ProductLookupProvider>,
  );
  return {
    get current(): ProductLookupContextValue {
      return latest;
    },
    rerender(next: { siteSlug: string; articleId: string | null }) {
      view.rerender(
        <ProductLookupProvider siteSlug={next.siteSlug} articleId={next.articleId}>
          <LookupProbe onValue={capture} />
        </ProductLookupProvider>,
      );
    },
  };
}

interface PendingFetch {
  url: string;
  resolve: (response: Response) => void;
}

/**
 * Mock de `fetch` que nunca resolve sozinho — cada chamada fica pendente
 * até o teste resolvê-la explicitamente via `resolveRequest`, que primeiro
 * CONFIRMA (via `waitFor`) que uma requisição cuja URL contém
 * `urlSubstring` foi de fato disparada, nunca assume ordem ou rótulos às
 * cegas (causa do bug anterior). Falha explicitamente se mais de uma
 * pendente colidir com o mesmo substring — o teste precisaria então usar
 * um substring mais específico.
 */
function createControlledFetch() {
  const pending: PendingFetch[] = [];

  const fetchMock = jest.fn<typeof fetch>((input) => {
    const url = String(input);
    return new Promise<Response>((resolve) => {
      pending.push({ url, resolve });
    });
  });

  async function resolveRequest(urlSubstring: string, response: Response) {
    await waitFor(() => {
      expect(pending.filter((request) => request.url.includes(urlSubstring))).toHaveLength(1);
    });
    const index = pending.findIndex((request) => request.url.includes(urlSubstring));
    const [request] = pending.splice(index, 1);
    await act(async () => {
      request!.resolve(response);
      // Dá chance ao `.then`/`.catch` do fetch resolvido (e a qualquer
      // `setState` decorrente) rodar antes de seguir.
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  return { fetchMock, resolveRequest };
}

describe('ProductLookupProvider — troca de identidade na MESMA instância (sem remontagem)', () => {
  it('ao trocar siteSlug+articleId sem remontar: volta a "loading" na MESMA renderização que recebe a nova identidade (nunca expõe productIds/catálogo do Artigo/Site anterior), e uma resposta tardia da identidade antiga nunca sobrescreve o estado da identidade nova', async () => {
    const SITE_SLUG_2 = 'quickdealday';
    const ARTICLE_ID_2 = '33333333-3333-4333-8333-333333333333';
    const PRODUCT_ID_2 = 'cccccccc-3333-4333-8333-333333333333';
    const PRODUCT_NAME_2 = 'Caixa de Som';

    const { fetchMock, resolveRequest } = createControlledFetch();
    global.fetch = fetchMock;

    const lookup = renderLookup({ siteSlug: SITE_SLUG, articleId: ARTICLE_ID });

    expect(lookup.current.overallStatus).toBe('loading');

    // Troca de identidade NA MESMA instância — `rerender`, nunca um novo
    // `render` — ANTES de qualquer resposta da primeira identidade chegar.
    lookup.rerender({ siteSlug: SITE_SLUG_2, articleId: ARTICLE_ID_2 });

    // A MESMA renderização que já recebeu a nova identidade deriva
    // 'loading' — nunca um quadro com dado da identidade anterior.
    expect(lookup.current.overallStatus).toBe('loading');
    expect(lookup.current.linkedProducts).toEqual([]);
    expect(lookup.current.resolveProduct(PRODUCT_ID)).toEqual({ status: 'loading' });

    // Resposta TARDIA da identidade ANTIGA chega só agora — o cleanup do
    // efeito antigo (disparado pela troca de props) já marcou
    // `cancelled = true`; isso nunca deve produzir 'ready'/dado do
    // Artigo/Site anterior. `resolveRequest` já confirma que a requisição
    // da identidade antiga foi de fato disparada antes de resolvê-la.
    await resolveRequest(`/articles/${ARTICLE_ID}/products`, jsonResponse(200, { productIds: [PRODUCT_ID] }));
    await resolveRequest(`/sites/${SITE_SLUG}/products`, catalogResponse([makeProduct(PRODUCT_ID, PRODUCT_NAME)]));

    expect(lookup.current.overallStatus).toBe('loading');
    expect(lookup.current.linkedProducts).toEqual([]);

    // Resposta da identidade NOVA resolve normalmente.
    await resolveRequest(`/articles/${ARTICLE_ID_2}/products`, jsonResponse(200, { productIds: [PRODUCT_ID_2] }));
    await resolveRequest(`/sites/${SITE_SLUG_2}/products`, catalogResponse([makeProduct(PRODUCT_ID_2, PRODUCT_NAME_2)]));

    await waitFor(() => expect(lookup.current.overallStatus).toBe('ready'));
    expect(lookup.current.linkedProducts.map((p) => p.id)).toEqual([PRODUCT_ID_2]);
    // productId da identidade ANTERIOR nunca aparece vinculado à identidade
    // nova — nunca fallback, nunca dado remanescente do Artigo anterior.
    expect(lookup.current.resolveProduct(PRODUCT_ID)).toEqual({ status: 'not-found' });
  });

  it('setProductIds grava com a requestKey da identidade ATUAL — uma mutação disparada antes de uma troca de identidade nunca vaza para a identidade nova', async () => {
    const SITE_SLUG_2 = 'quickdealday';
    const ARTICLE_ID_2 = '33333333-3333-4333-8333-333333333333';
    const PRODUCT_ID_2 = 'cccccccc-3333-4333-8333-333333333333';

    global.fetch = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes(`/articles/${ARTICLE_ID}/products`)) {
        return jsonResponse(200, { productIds: [] });
      }
      if (url.includes(`/articles/${ARTICLE_ID_2}/products`)) {
        return jsonResponse(200, { productIds: [PRODUCT_ID_2] });
      }
      return catalogResponse([makeProduct(PRODUCT_ID, PRODUCT_NAME), makeProduct(PRODUCT_ID_2, 'Caixa de Som')]);
    });

    const lookup = renderLookup({ siteSlug: SITE_SLUG, articleId: ARTICLE_ID });

    await waitFor(() => expect(lookup.current.overallStatus).toBe('ready'));

    // Vincula um Produto na identidade ORIGINAL (mesmo contrato de
    // `ArticleProductsSection` após uma mutação bem-sucedida).
    act(() => {
      lookup.current.setProductIds([PRODUCT_ID]);
    });
    expect(lookup.current.linkedProducts.map((p) => p.id)).toEqual([PRODUCT_ID]);

    // Troca de identidade na MESMA instância — a mutação acima NUNCA deve
    // ser observável na identidade nova.
    lookup.rerender({ siteSlug: SITE_SLUG_2, articleId: ARTICLE_ID_2 });
    expect(lookup.current.overallStatus).toBe('loading');
    expect(lookup.current.linkedProducts).toEqual([]);

    await waitFor(() => expect(lookup.current.overallStatus).toBe('ready'));
    expect(lookup.current.linkedProducts.map((p) => p.id)).toEqual([PRODUCT_ID_2]);
  });
});
