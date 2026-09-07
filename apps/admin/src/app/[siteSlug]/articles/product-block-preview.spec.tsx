/**
 * apps/admin/src/app/[siteSlug]/articles/product-block-preview.spec.tsx
 *
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição (preview Admin).
 *
 * Testa `ProductBlockPreview` isoladamente — a responsabilidade própria
 * deste componente é só a RENDERIZAÇÃO por estado de resolução (texto,
 * `role`, sufixo "(arquivado)", nunca ":::product" cru); a lógica de
 * resolução em si (membership em `linkedIdSet`, mapeamento contra o
 * catálogo) já é coberta exaustivamente em
 * `product-lookup-context.spec.tsx` contra `resolveProduct` diretamente —
 * não duplicada aqui. Usa sempre `ProductLookupProvider` real (nunca um
 * Context customizado — `ProductLookupContext` não é exportado, só
 * `useProductLookup`/`ProductLookupProvider`), com `global.fetch` mockado
 * por caso, e o caso "unavailable" sem nenhum Provider (valor default do
 * Context).
 */
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { ProductBlockPreview } from './product-block-preview';
import { ProductLookupProvider } from './product-lookup-context';

const SITE_SLUG = 'fastcompre';
const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const UNLINKED_PRODUCT_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

function makeProduct(id: string, name: string, archivedAt: string | null = null) {
  return {
    id,
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    name,
    slug: name.toLowerCase(),
    description: null,
    imageUrl: null,
    archivedAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(JSON.stringify(body)) } as Response;
}

function mockFetch(productIds: string[], catalog: ReturnType<typeof makeProduct>[]): void {
  global.fetch = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith('/products')) {
      return jsonResponse(200, { productIds });
    }
    return jsonResponse(200, { items: catalog, page: 1, pageSize: 100, total: catalog.length, totalPages: 1 });
  });
}

function renderWithProvider(productId: string) {
  return render(
    <ProductLookupProvider siteSlug={SITE_SLUG} articleId={ARTICLE_ID}>
      <ProductBlockPreview productId={productId} />
    </ProductLookupProvider>,
  );
}

describe('ProductBlockPreview', () => {
  it('Produto vinculado ativo: mostra o nome, sem sufixo — nunca ":::product" no texto', async () => {
    mockFetch([PRODUCT_ID], [makeProduct(PRODUCT_ID, 'Fone Bluetooth')]);
    const { container } = renderWithProvider(PRODUCT_ID);

    await waitFor(() => expect(screen.getByText('Fone Bluetooth')).toBeInTheDocument());
    expect(container.textContent).not.toContain(':::product');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Produto vinculado arquivado: mostra o nome com o sufixo "(arquivado)"', async () => {
    mockFetch([PRODUCT_ID], [makeProduct(PRODUCT_ID, 'Fone Bluetooth', '2026-02-01T00:00:00.000Z')]);
    renderWithProvider(PRODUCT_ID);

    await waitFor(() => expect(screen.getByText('Fone Bluetooth (arquivado)')).toBeInTheDocument());
  });

  it('referência a um productId real mas NÃO vinculado a este Artigo (órfã): estado "not-found" explícito, nunca outro Produto', async () => {
    mockFetch([PRODUCT_ID], [makeProduct(PRODUCT_ID, 'Fone Bluetooth'), makeProduct(UNLINKED_PRODUCT_ID, 'Caixa de Som')]);
    renderWithProvider(UNLINKED_PRODUCT_ID);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Produto vinculado não encontrado.'));
    expect(screen.queryByText('Caixa de Som')).not.toBeInTheDocument();
  });

  it('carregando: mostra status de carregamento, sem role="alert"', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    renderWithProvider(PRODUCT_ID);

    expect(screen.getByRole('status')).toHaveTextContent('Carregando Produto vinculado...');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('erro ao carregar a fonte compartilhada: mensagem genérica de erro', async () => {
    global.fetch = jest.fn<typeof fetch>(async () => jsonResponse(500, { unexpected: 'shape' }));
    renderWithProvider(PRODUCT_ID);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o Produto vinculado.'),
    );
  });

  it('sem ProductLookupProvider (fonte indisponível): mesma mensagem genérica de erro, nunca quebra', () => {
    render(<ProductBlockPreview productId={PRODUCT_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o Produto vinculado.');
  });
});
