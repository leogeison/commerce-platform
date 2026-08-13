import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArticleProductsSection } from './article-products-section';

const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';
const SITE_SLUG = 'fastcompre';

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

const PRODUCT_A = makeProduct('aaaaaaaa-1111-4111-8111-111111111111', 'Fone Bluetooth');
const PRODUCT_B = makeProduct('bbbbbbbb-2222-4222-8222-222222222222', 'Caixa de Som');
const PRODUCT_ARCHIVED = makeProduct('cccccccc-3333-4333-8333-333333333333', 'Produto Descontinuado', '2026-01-02T00:00:00.000Z');

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

function productsPath() {
  return `/admin/sites/${SITE_SLUG}/articles/${ARTICLE_ID}/products`;
}

function render_() {
  return render(<ArticleProductsSection siteSlug={SITE_SLUG} articleId={ARTICLE_ID} />);
}

describe('ArticleProductsSection', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando Produtos vinculados..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    render_();

    expect(screen.getByText('Carregando Produtos vinculados...')).toBeInTheDocument();
  });

  it('sem Produtos vinculados: mostra mensagem, catálogo populado no select de disponíveis', async () => {
    global.fetch = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [] });
      }
      return catalogResponse([PRODUCT_A, PRODUCT_B]);
    });
    render_();

    expect(await screen.findByText('Nenhum Produto vinculado.')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fone Bluetooth' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Caixa de Som' })).toBeInTheDocument();
  });

  it('erro ao carregar vínculos ou catálogo: mostra mensagem genérica', async () => {
    global.fetch = jest.fn<typeof fetch>(async () => jsonResponse(500, { unexpected: 'shape' }));
    render_();

    expect(await screen.findByText('Não foi possível carregar os Produtos vinculados.')).toBeInTheDocument();
  });

  it('Produtos vinculados: exibe na ordem de productIds, resolvendo nome pelo catálogo; disponíveis exclui os já vinculados', async () => {
    global.fetch = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [PRODUCT_B.id, PRODUCT_A.id] });
      }
      return catalogResponse([PRODUCT_A, PRODUCT_B, PRODUCT_ARCHIVED]);
    });
    render_();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Caixa de Som');
    expect(items[1]).toHaveTextContent('Fone Bluetooth');

    // Disponíveis: só o que não está vinculado.
    expect(screen.getByRole('option', { name: 'Produto Descontinuado (arquivado)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Fone Bluetooth' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Caixa de Som' })).not.toBeInTheDocument();
  });

  it('vincular: seleciona um Produto disponível, chama POST, atualiza a lista com a resposta', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({ productId: PRODUCT_A.id });
        return jsonResponse(201, { productIds: [PRODUCT_A.id] });
      }
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [] });
      }
      return catalogResponse([PRODUCT_A]);
    });
    render_();

    await screen.findByText('Nenhum Produto vinculado.');
    await user.selectOptions(screen.getByLabelText('Adicionar Produto'), PRODUCT_A.id);
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    await waitFor(() => expect(screen.getByText('Fone Bluetooth')).toBeInTheDocument());
    expect(screen.queryByText('Nenhum Produto vinculado.')).not.toBeInTheDocument();
  });

  it('desvincular: chama DELETE, atualiza a lista com a resposta', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (init?.method === 'DELETE') {
        expect(url).toContain(`${productsPath()}/${PRODUCT_A.id}`);
        return jsonResponse(200, { productIds: [] });
      }
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [PRODUCT_A.id] });
      }
      return catalogResponse([PRODUCT_A]);
    });
    render_();

    await screen.findByText('Fone Bluetooth');
    await user.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(screen.getByText('Nenhum Produto vinculado.')).toBeInTheDocument());
  });

  it('reordenar: "Mover para baixo" chama PATCH reorder com a lista completa reordenada', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (init?.method === 'PATCH' && url.endsWith('/reorder')) {
        expect(JSON.parse(String(init.body))).toEqual({ productIds: [PRODUCT_B.id, PRODUCT_A.id] });
        return jsonResponse(200, { productIds: [PRODUCT_B.id, PRODUCT_A.id] });
      }
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [PRODUCT_A.id, PRODUCT_B.id] });
      }
      return catalogResponse([PRODUCT_A, PRODUCT_B]);
    });
    render_();

    await screen.findByText('Fone Bluetooth');
    await user.click(screen.getByRole('button', { name: `Mover ${PRODUCT_A.name} para baixo` }));

    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('Caixa de Som');
      expect(items[1]).toHaveTextContent('Fone Bluetooth');
    });
  });

  it('primeiro item: "Mover para cima" desabilitado; último item: "Mover para baixo" desabilitado', async () => {
    global.fetch = jest.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [PRODUCT_A.id, PRODUCT_B.id] });
      }
      return catalogResponse([PRODUCT_A, PRODUCT_B]);
    });
    render_();

    await screen.findByText('Fone Bluetooth');
    expect(screen.getByRole('button', { name: `Mover ${PRODUCT_A.name} para cima` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `Mover ${PRODUCT_B.name} para baixo` })).toBeDisabled();
  });

  it('erro de negócio ao vincular (409): mostra a mensagem da API', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST') {
        return jsonResponse(409, {
          statusCode: 409,
          code: 'CONFLICT',
          error: 'Conflict',
          message: 'Este Produto já está vinculado a este Artigo.',
        });
      }
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [] });
      }
      return catalogResponse([PRODUCT_A]);
    });
    render_();

    await screen.findByText('Nenhum Produto vinculado.');
    await user.selectOptions(screen.getByLabelText('Adicionar Produto'), PRODUCT_A.id);
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    expect(await screen.findByText('Este Produto já está vinculado a este Artigo.')).toBeInTheDocument();
  });
});
