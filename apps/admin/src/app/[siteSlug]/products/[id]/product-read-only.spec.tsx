import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import { ProductReadOnly } from './product-read-only';

const SITE_SLUG = 'fastcompre';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function emptyPaginated() {
  return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
}

const baseProduct = {
  id: '11111111-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  categoryId: null,
  name: 'Fone Bluetooth',
  slug: 'fone-bluetooth',
  description: null,
  imageUrl: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  offers: [],
};

/**
 * Mesmo helper já usado em `article-read-only.spec.tsx` — flusha as
 * promises pendentes do `fetchAllCategories` para evitar warnings de `act()`
 * em testes que não têm um valor visível esperando o fetch terminar.
 */
async function flushPendingFetches() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ProductReadOnly', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('produto ativo, sem categoria/descrição/imagem: mostra os rótulos "Sem"', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(emptyPaginated());
    render(<ProductReadOnly siteSlug={SITE_SLUG} product={baseProduct} />);

    expect(screen.getByRole('heading', { name: 'Fone Bluetooth' })).toBeInTheDocument();
    expect(screen.getByText('fone-bluetooth')).toBeInTheDocument();
    expect(screen.getByText('Sem categoria')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText('Sem descrição')).toBeInTheDocument();
    expect(screen.getByText('Sem imagem')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    await flushPendingFetches();
  });

  it('produto arquivado: mostra status "Arquivado"', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(emptyPaginated());
    render(
      <ProductReadOnly
        siteSlug={SITE_SLUG}
        product={{ ...baseProduct, archivedAt: '2026-01-02T00:00:00.000Z' }}
      />,
    );

    expect(screen.getByText('Arquivado')).toBeInTheDocument();

    await flushPendingFetches();
  });

  it('resolve o nome da Categoria vinculada', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        items: [
          {
            id: '99999999-9999-4999-8999-999999999999',
            siteId: '22222222-2222-4222-8222-222222222222',
            name: 'Eletrônicos',
            slug: 'eletronicos',
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      }),
    );
    render(
      <ProductReadOnly
        siteSlug={SITE_SLUG}
        product={{ ...baseProduct, categoryId: '99999999-9999-4999-8999-999999999999' }}
      />,
    );

    expect(await screen.findByText('Eletrônicos')).toBeInTheDocument();
  });

  it('descrição/imagem presentes: mostra o texto e a imagem', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(emptyPaginated());
    render(
      <ProductReadOnly
        siteSlug={SITE_SLUG}
        product={{
          ...baseProduct,
          description: 'Fone com cancelamento de ruído.',
          imageUrl: 'https://cdn.example.com/fone.jpg',
        }}
      />,
    );

    expect(screen.getByText('Fone com cancelamento de ruído.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Imagem do Produto' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/fone.jpg',
    );

    await flushPendingFetches();
  });
});
