'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { articleProductsResponseSchema, type ProductAdmin } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { fetchAllProducts } from '../../../lib/fetch-all-products';

/**
 * apps/admin/src/app/[siteSlug]/articles/product-lookup-context.tsx
 *
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição.
 *
 * Fonte única de `ArticleProduct` (via `GET .../articles/:articleId/products`,
 * mesmo endpoint já usado por `ArticleProductsSection`) + catálogo completo
 * do Site (`fetchAllProducts`, mesma função já usada por
 * `ArticleProductsSection`) — antes desta tarefa, as duas buscas viviam
 * exclusivamente dentro de `ArticleProductsSection`; agora nascem aqui,
 * posicionadas acima de `ArticleForm` e `ArticleProductsSection` (montado
 * por `ArticleDetail`/`CreateArticle`), para que o editor Lexical do corpo
 * do Artigo (menu `/`, decorator do `ProductBlockNode`, fluxo de inserção/
 * edição, preview) e `ArticleProductsSection` leiam exatamente a mesma
 * fonte — nenhum dos dois lados dispara fetch próprio.
 *
 * `articleId === null` — caso de `/articles/new` (Artigo ainda não
 * persistido) — é um estado estrutural "indisponível", nunca uma busca
 * disparada e nunca confundido com falha de rede: nenhuma das duas buscas
 * roda enquanto `articleId` for `null`. É o que `/articles/new` usa para
 * manter o item "Bloco Produto-Oferta" do menu `/` indisponível (com
 * explicação acessível), já que não existe nenhum `ArticleProduct`
 * vinculável sem um Artigo persistido.
 *
 * Combinação de estados (loading/error) preservada IDÊNTICA ao
 * comportamento pré-existente de `ArticleProductsSection`, fechamento
 * explícito desta tarefa: carregando enquanto qualquer uma das duas buscas
 * estiver pendente; erro se qualquer uma das duas falhar (sem distinguir
 * qual) — nenhuma tentativa nova de retry automático (a seção nunca teve
 * mecanismo de retry).
 *
 * Mutações (link/unlink/reorder, permanecem só em `ArticleProductsSection`)
 * atualizam este Provider diretamente via `setProductIds` — cada mutação já
 * recebe `{ productIds }` atualizado da própria resposta da API. Fechamento
 * explícito desta tarefa: sem `refreshToken`/polling/invalidação — a única
 * fonte de mutação, enquanto a página está montada, já atualiza o Provider
 * diretamente.
 *
 * CORREÇÃO (rodada de lint pós-suíte global) — `ProductLookupProvider` NÃO
 * tem garantia de remontar quando `siteSlug`/`articleId` mudam: o ponto de
 * montagem (`[id]/page.tsx`) é um Server Component async que resolve `id`
 * via `params` e renderiza `<ArticleDetail siteSlug={...} id={...} />` sem
 * nenhum `key` — a reconciliação do React só remonta um componente filho
 * quando tipo/posição mudam ou um `key` muda, nunca só porque as props de
 * um ancestral Server Component mudaram; uma navegação client-side entre
 * dois Artigos diferentes sob a mesma rota tende a REUTILIZAR a mesma
 * instância de `ArticleDetail`/deste Provider, só com novas props. Por
 * isso `productIdsState`/`catalogState` NUNCA são `useState` resetado via
 * `setState({status:'loading'})` dentro do corpo de um efeito (o que
 * violaria `react-hooks/set-state-in-effect` E deixaria, por uma
 * renderização inteira antes do efeito rodar, o resultado ASSENTADO da
 * identidade ANTERIOR ainda observável com as props da identidade NOVA já
 * recebidas) — em vez disso, só o resultado ASSENTADO ('ready'/'error') de
 * cada busca é guardado em estado, etiquetado pela identidade
 * (`siteSlug`+`articleId`) a que pertence (`requestKeyFor`), e 'loading' é
 * sempre DERIVADO na própria renderização comparando essa etiqueta com a
 * identidade atual — nenhum dado de outro Artigo/Site fica observável em
 * nenhum quadro, em nenhuma das duas hipóteses (remontagem ou reuso).
 */

export type ProductIdsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; productIds: string[] };
export type CatalogState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: ProductAdmin[] };

/**
 * Resultado de resolver um `productId` referenciado por um `ProductBlockNode`
 * (decorator do editor) ou por um segmento de bloco no preview Admin contra
 * a fonte compartilhada. `not-found` é o estado explícito e obrigatório
 * (Editorial Serialization Contract §5) para um `productId` sintaticamente
 * válido, real, porém não vinculado ao Artigo atual — nunca fallback para
 * outro Produto, nunca omissão silenciosa.
 */
export type ProductResolution =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not-found' }
  | { status: 'ready'; product: ProductAdmin };

export interface ProductLookupContextValue {
  /** `null` em `/articles/new` — nenhum `ArticleProduct` pode existir ainda. */
  articleId: string | null;
  productIdsState: ProductIdsState;
  catalogState: CatalogState;
  /**
   * Atualiza a fonte compartilhada diretamente a partir da resposta de uma
   * mutação já concluída (link/unlink/reorder) — nunca dispara um novo
   * `GET`. Único ponto de escrita nesta fonte; só `ArticleProductsSection`
   * chama isso hoje.
   */
  setProductIds: (productIds: string[]) => void;
  /**
   * Produtos vinculados ao Artigo, na ordem de `productIds`, já com nome
   * resolvido contra o catálogo — `[]` enquanto `overallStatus` não for
   * `'ready'`. Mesma fonte usada por `ArticleProductsSection` para sua
   * lista e pelo fluxo de inserção do bloco (`ArticleBodyProductFlow`) para
   * o seletor — escopo `UXE-011` explícito: só Produtos JÁ vinculados,
   * nunca o catálogo inteiro do Site.
   */
  linkedProducts: ProductAdmin[];
  overallStatus: 'unavailable' | 'loading' | 'error' | 'ready';
  resolveProduct: (productId: string) => ProductResolution;
}

function productsPath(siteSlug: string, articleId: string): string {
  return `/admin/sites/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(articleId)}/products`;
}

function unavailableResolve(): ProductResolution {
  return { status: 'unavailable' };
}

const UNAVAILABLE_CONTEXT_VALUE: ProductLookupContextValue = {
  articleId: null,
  productIdsState: { status: 'error' },
  catalogState: { status: 'error' },
  setProductIds: () => {},
  linkedProducts: [],
  overallStatus: 'unavailable',
  resolveProduct: unavailableResolve,
};

/**
 * Valor default (sem `Provider` ancestral): estado "indisponível" seguro,
 * nunca lança. Necessário porque testes/composições pré-existentes de
 * `ArticleForm` (`article-form.spec.tsx`) renderizam o componente sem
 * nenhum `ProductLookupProvider` — continuam passando sem alteração porque
 * `useProductLookup()` nunca exige um Provider presente.
 */
const ProductLookupContext = createContext<ProductLookupContextValue>(UNAVAILABLE_CONTEXT_VALUE);

export function useProductLookup(): ProductLookupContextValue {
  return useContext(ProductLookupContext);
}

interface ProductLookupProviderProps {
  siteSlug: string;
  articleId: string | null;
  children: ReactNode;
}

/**
 * Identifica de forma única a combinação `siteSlug`+`articleId` a que um
 * resultado ASSENTADO ('ready'/'error') pertence. `null` para
 * `articleId === null` (`/articles/new`) — nenhuma busca é disparada nesse
 * caso, idêntico ao comportamento anterior; nunca usado para comparar
 * contra um resultado guardado, já que nenhum resultado é guardado com
 * chave `null`.
 */
function requestKeyFor(siteSlug: string, articleId: string | null): string | null {
  return articleId === null ? null : `${siteSlug}::${articleId}`;
}

// Referências estáveis (módulo, nunca recriadas) para o fallback 'loading'
// derivado abaixo — evita que `value` (e `linkedProducts`/`resolveProduct`,
// via o `useMemo` mais abaixo) seja recriado a cada renderização só porque
// a comparação de identidade produziu um objeto litera novo.
const LOADING_PRODUCT_IDS_STATE: ProductIdsState = { status: 'loading' };
const LOADING_CATALOG_STATE: CatalogState = { status: 'loading' };

export function ProductLookupProvider({ siteSlug, articleId, children }: ProductLookupProviderProps) {
  const requestKey = requestKeyFor(siteSlug, articleId);

  // Só o desfecho ASSENTADO ('ready'/'error') de cada busca vive em
  // estado, etiquetado pela identidade a que pertence — 'loading' nunca é
  // escrito via `setState`, só derivado abaixo (ver doc comment do topo
  // do arquivo, seção "CORREÇÃO"). `Exclude<..., { status: 'loading' }>`
  // remove exatamente o membro 'loading' da união, preservando os demais
  // com seu shape original (`productIds`/`items` incluídos).
  const [productIdsResult, setProductIdsResult] = useState<{
    key: string;
    state: Exclude<ProductIdsState, { status: 'loading' }>;
  } | null>(null);
  const [catalogResult, setCatalogResult] = useState<{
    key: string;
    state: Exclude<CatalogState, { status: 'loading' }>;
  } | null>(null);

  useEffect(() => {
    if (articleId === null) {
      return;
    }
    const key = `${siteSlug}::${articleId}`;
    let cancelled = false;

    apiRequest(productsPath(siteSlug, articleId), articleProductsResponseSchema)
      .then((data) => {
        if (!cancelled) {
          setProductIdsResult({ key, state: { status: 'ready', productIds: data.productIds } });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProductIdsResult({ key, state: { status: 'error' } });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, articleId]);

  useEffect(() => {
    if (articleId === null) {
      return;
    }
    const key = `${siteSlug}::${articleId}`;
    let cancelled = false;

    fetchAllProducts(siteSlug)
      .then((items) => {
        if (!cancelled) {
          setCatalogResult({ key, state: { status: 'ready', items } });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogResult({ key, state: { status: 'error' } });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, articleId]);

  // Derivado na própria renderização — nunca via `setState` no corpo de um
  // efeito. Uma resposta cuja `key` não bate com a identidade ATUAL das
  // props (resultado de uma navegação já superada, ainda em voo quando a
  // troca de identidade aconteceu) nunca fica observável: a comparação
  // abaixo já a ignora, além do `cancelled` do efeito impedir até a
  // escrita em si.
  // Checagem direta `!== null` (nunca encadeamento opcional `?.`) de
  // propósito: `a?.b === c` NÃO estreita o tipo de `a` para não-nulo no
  // ramo verdadeiro de um ternário (o TypeScript não infere isso através
  // de encadeamento opcional) — sem a checagem explícita abaixo,
  // `productIdsResult.state`/`catalogResult.state` no ramo verdadeiro
  // seriam um erro de tipo ("possibly null").
  const productIdsState: ProductIdsState =
    requestKey !== null && productIdsResult !== null && productIdsResult.key === requestKey
      ? productIdsResult.state
      : LOADING_PRODUCT_IDS_STATE;
  const catalogState: CatalogState =
    requestKey !== null && catalogResult !== null && catalogResult.key === requestKey
      ? catalogResult.state
      : LOADING_CATALOG_STATE;

  const setProductIds = useCallback(
    (productIds: string[]) => {
      if (requestKey === null) {
        return;
      }
      setProductIdsResult({ key: requestKey, state: { status: 'ready', productIds } });
    },
    [requestKey],
  );

  const value = useMemo<ProductLookupContextValue>(() => {
    if (articleId === null) {
      return UNAVAILABLE_CONTEXT_VALUE;
    }

    if (productIdsState.status === 'ready' && catalogState.status === 'ready') {
      const productMap = new Map(catalogState.items.map((product) => [product.id, product]));
      const linkedIdSet = new Set(productIdsState.productIds);
      const linkedProducts = productIdsState.productIds
        .map((id) => productMap.get(id))
        .filter((product): product is ProductAdmin => product !== undefined);

      return {
        articleId,
        productIdsState,
        catalogState,
        setProductIds,
        linkedProducts,
        overallStatus: 'ready',
        resolveProduct: (productId: string): ProductResolution => {
          if (!linkedIdSet.has(productId)) {
            // productId sintaticamente válido, mas não vinculado a ESTE
            // Artigo — estado explícito exigido pelo Contract §5, nunca
            // fallback para outro Produto.
            return { status: 'not-found' };
          }
          const product = productMap.get(productId);
          return product ? { status: 'ready', product } : { status: 'not-found' };
        },
      };
    }

    if (productIdsState.status === 'error' || catalogState.status === 'error') {
      return {
        articleId,
        productIdsState,
        catalogState,
        setProductIds,
        linkedProducts: [],
        overallStatus: 'error',
        resolveProduct: () => ({ status: 'error' }),
      };
    }

    return {
      articleId,
      productIdsState,
      catalogState,
      setProductIds,
      linkedProducts: [],
      overallStatus: 'loading',
      resolveProduct: () => ({ status: 'loading' }),
    };
  }, [articleId, productIdsState, catalogState, setProductIds]);

  return <ProductLookupContext.Provider value={value}>{children}</ProductLookupContext.Provider>;
}
