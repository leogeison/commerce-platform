import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminApiError } from '../../../lib/api-error';
import { ProductForm, type ProductFormValues } from './product-form';

type SubmitFn = (values: ProductFormValues) => Promise<void>;

function makeCategory(id: string, name: string, archivedAt: string | null = null) {
  return {
    id,
    siteId: '22222222-2222-4222-8222-222222222222',
    name,
    slug: name.toLowerCase(),
    archivedAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const ACTIVE_CATEGORY = makeCategory('11111111-1111-4111-8111-111111111111', 'Eletrônicos');
const ARCHIVED_CATEGORY = makeCategory(
  '22222222-2222-4222-8222-222222222222',
  'Descontinuados',
  '2026-01-02T00:00:00.000Z',
);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

/**
 * Mocka `global.fetch` diferenciando a busca de Categorias (`GET`, usada
 * por `fetchAllCategories` internamente) do upload de imagem (`POST` para
 * `/uploads/images`) — os dois únicos endpoints que `ProductForm` chama
 * por fora do `onSubmit` injetado.
 */
function mockFetch(options: { categories?: unknown[]; categoriesFail?: boolean; upload?: 'success' | 'fail' }) {
  const fetchMock = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('/uploads/images')) {
      if (options.upload === 'fail') {
        return jsonResponse(400, {
          statusCode: 400,
          code: 'BadRequestException',
          error: 'Bad Request',
          message: 'Formato de arquivo não permitido.',
        });
      }
      return jsonResponse(201, { url: 'https://cdn.example.com/nova-imagem.jpg' });
    }

    if (options.categoriesFail) {
      return jsonResponse(500, { unexpected: 'shape' });
    }

    return jsonResponse(200, {
      items: options.categories ?? [ACTIVE_CATEGORY],
      page: 1,
      pageSize: 100,
      total: (options.categories ?? [ACTIVE_CATEGORY]).length,
      totalPages: 1,
    });
  });
  global.fetch = fetchMock;
  return fetchMock;
}

function uploadCallCount(fetchMock: jest.Mock<typeof fetch>): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes('/uploads/images')).length;
}

const emptyInitialValues: ProductFormValues = {
  name: '',
  slug: '',
  categoryId: null,
  description: null,
  imageUrl: null,
};

let createObjectURLCallCount = 0;

describe('ProductForm', () => {
  beforeEach(() => {
    createObjectURLCallCount = 0;
    // jsdom não implementa `URL.createObjectURL`/`revokeObjectURL` — mock
    // dedicado, com uma URL de blob distinta por chamada, para poder
    // afirmar sobre qual URL específica foi revogada em cada cenário.
    URL.createObjectURL = jest.fn(() => `blob:mock-${(createObjectURLCallCount += 1)}`) as typeof URL.createObjectURL;
    URL.revokeObjectURL = jest.fn() as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('modo criar: carrega Categorias e não oferece nenhuma arquivada como opção', async () => {
    mockFetch({ categories: [ACTIVE_CATEGORY, ARCHIVED_CATEGORY] });
    render(
      <ProductForm siteSlug="fastcompre" initialValues={emptyInitialValues} submitLabel="Criar" onSubmit={jest.fn<SubmitFn>()} />,
    );

    await waitFor(() => expect(screen.getByRole('option', { name: 'Eletrônicos' })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: /Descontinuados/ })).not.toBeInTheDocument();
  });

  it('modo editar: Categoria atual arquivada aparece como opção extra, identificada; outras arquivadas continuam de fora', async () => {
    mockFetch({ categories: [ACTIVE_CATEGORY, ARCHIVED_CATEGORY] });
    render(
      <ProductForm
        siteSlug="fastcompre"
        initialValues={{ ...emptyInitialValues, categoryId: ARCHIVED_CATEGORY.id }}
        submitLabel="Salvar"
        onSubmit={jest.fn<SubmitFn>()}
      />,
    );

    expect(await screen.findByRole('option', { name: 'Descontinuados (arquivada)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Eletrônicos' })).toBeInTheDocument();
  });

  it('falha ao carregar Categorias: mostra erro acessível, seletor desabilitado', async () => {
    mockFetch({ categoriesFail: true });
    render(
      <ProductForm siteSlug="fastcompre" initialValues={emptyInitialValues} submitLabel="Criar" onSubmit={jest.fn<SubmitFn>()} />,
    );

    expect(await screen.findByText('Não foi possível carregar as Categorias.')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoria')).toBeDisabled();
  });

  it('renderiza os valores iniciais, incluindo preview da imagem existente', async () => {
    mockFetch({});
    render(
      <ProductForm
        siteSlug="fastcompre"
        initialValues={{
          name: 'Fone Bluetooth',
          slug: 'fone-bluetooth',
          categoryId: null,
          description: 'Ótimo custo-benefício',
          imageUrl: 'https://cdn.example.com/fone.jpg',
        }}
        submitLabel="Salvar"
        onSubmit={jest.fn<SubmitFn>()}
      />,
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('Fone Bluetooth');
    expect(screen.getByLabelText('Slug')).toHaveValue('fone-bluetooth');
    expect(screen.getByLabelText('Descrição')).toHaveValue('Ótimo custo-benefício');
    expect(screen.getByRole('img', { name: 'Imagem do Produto' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/fone.jpg',
    );
  });

  it('nome/slug vazios: mostra erro de campo, não chama onSubmit', async () => {
    mockFetch({});
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>();
    render(<ProductForm siteSlug="fastcompre" initialValues={emptyInitialValues} submitLabel="Criar" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findAllByRole('alert')).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submit válido com categoria/descrição vazias e sem imagem: chama onSubmit com null nesses campos', async () => {
    mockFetch({});
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    render(<ProductForm siteSlug="fastcompre" initialValues={emptyInitialValues} submitLabel="Criar" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Nome'), 'Fone Bluetooth');
    await user.type(screen.getByLabelText('Slug'), 'fone-bluetooth');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Fone Bluetooth',
        slug: 'fone-bluetooth',
        categoryId: null,
        description: null,
        imageUrl: null,
      }),
    );
  });

  it('durante o submit (sem imagem): desabilita campos e botão', async () => {
    mockFetch({});
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    const onSubmit = jest.fn<SubmitFn>().mockReturnValue(pending);
    render(
      <ProductForm
        siteSlug="fastcompre"
        initialValues={{ ...emptyInitialValues, name: 'Fone', slug: 'fone' }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvando...' })).toBeDisabled();
    expect(screen.getByLabelText('Nome')).toBeDisabled();

    resolveSubmit();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar' })).not.toBeDisabled());
  });

  it('erro de negócio no submit (409): mostra a mensagem da API', async () => {
    mockFetch({});
    const user = userEvent.setup();
    const onSubmit = jest
      .fn<SubmitFn>()
      .mockRejectedValue(new AdminApiError('Já existe um produto com este slug neste Site.', { statusCode: 409 }));
    render(
      <ProductForm
        siteSlug="fastcompre"
        initialValues={{ ...emptyInitialValues, name: 'Fone', slug: 'fone' }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já existe um produto com este slug neste Site.')).toBeInTheDocument();
  });

  it('erro inesperado no submit: mostra mensagem genérica fixa', async () => {
    mockFetch({});
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockRejectedValue(new Error('network down'));
    render(
      <ProductForm
        siteSlug="fastcompre"
        initialValues={{ ...emptyInitialValues, name: 'Fone', slug: 'fone' }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar o Produto. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });

  it('selecionar arquivo: mostra preview local via URL.createObjectURL, sem nenhuma chamada de rede', async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();
    render(<ProductForm siteSlug="fastcompre" initialValues={emptyInitialValues} submitLabel="Criar" onSubmit={jest.fn<SubmitFn>()} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Eletrônicos' })).toBeInTheDocument());

    const file = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Imagem'), file);

    expect(await screen.findByRole('img', { name: 'Imagem do Produto' })).toHaveAttribute('src', 'blob:mock-1');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(uploadCallCount(fetchMock)).toBe(0);
  });

  it('selecionar o mesmo arquivo várias vezes antes do submit: nenhuma chamada de upload é feita (regressão do bug relatado)', async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();
    render(<ProductForm siteSlug="fastcompre" initialValues={emptyInitialValues} submitLabel="Criar" onSubmit={jest.fn<SubmitFn>()} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Eletrônicos' })).toBeInTheDocument());

    const file = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText('Imagem');
    await user.upload(input, file);
    await user.upload(input, file);
    await user.upload(input, file);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
    expect(uploadCallCount(fetchMock)).toBe(0);
  });

  it('submit com arquivo selecionado: faz upload exatamente uma vez e chama onSubmit com a URL retornada', async () => {
    const fetchMock = mockFetch({ upload: 'success' });
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    render(
      <ProductForm
        siteSlug="fastcompre"
        initialValues={{ ...emptyInitialValues, name: 'Fone', slug: 'fone' }}
        submitLabel="Criar"
        onSubmit={onSubmit}
      />,
    );

    const file = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Imagem'), file);
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://cdn.example.com/nova-imagem.jpg' }),
      ),
    );
    expect(uploadCallCount(fetchMock)).toBe(1);
  });

  it('upload falha no submit: onSubmit nunca é chamado, mensagem de erro exibida, formulário volta a ficar usável', async () => {
    const fetchMock = mockFetch({ upload: 'fail' });
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    render(
      <ProductForm
        siteSlug="fastcompre"
        initialValues={{ ...emptyInitialValues, name: 'Fone', slug: 'fone' }}
        submitLabel="Criar"
        onSubmit={onSubmit}
      />,
    );

    const file = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Imagem'), file);
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Formato de arquivo não permitido.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(uploadCallCount(fetchMock)).toBe(1);
    expect(screen.getByRole('button', { name: 'Criar' })).not.toBeDisabled();
  });

  it('upload bem-sucedido mas persistência falha: nova tentativa reaproveita a URL já enviada, sem novo upload', async () => {
    const fetchMock = mockFetch({ upload: 'success' });
    const user = userEvent.setup();
    const onSubmit = jest
      .fn<SubmitFn>()
      .mockRejectedValueOnce(new AdminApiError('Já existe um produto com este slug neste Site.', { statusCode: 409 }))
      .mockResolvedValueOnce(undefined);
    render(
      <ProductForm
        siteSlug="fastcompre"
        initialValues={{ ...emptyInitialValues, name: 'Fone', slug: 'fone' }}
        submitLabel="Criar"
        onSubmit={onSubmit}
      />,
    );

    const file = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Imagem'), file);
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Já existe um produto com este slug neste Site.')).toBeInTheDocument();
    expect(uploadCallCount(fetchMock)).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ imageUrl: 'https://cdn.example.com/nova-imagem.jpg' }),
    );
    // Upload continua tendo acontecido exatamente 1 vez no total, mesmo
    // após a segunda tentativa de submit.
    expect(uploadCallCount(fetchMock)).toBe(1);
  });

  it('editar sem trocar imagem: preserva a imageUrl atual, sem chamada de upload', async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    render(
      <ProductForm
        siteSlug="fastcompre"
        initialValues={{
          ...emptyInitialValues,
          name: 'Fone',
          slug: 'fone',
          imageUrl: 'https://cdn.example.com/original.jpg',
        }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: 'https://cdn.example.com/original.jpg' })),
    );
    expect(uploadCallCount(fetchMock)).toBe(0);
  });

  it('remover imagem no modo editar: esconde o preview e envia imageUrl null, sem chamada de upload', async () => {
    const fetchMock = mockFetch({});
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    render(
      <ProductForm
        siteSlug="fastcompre"
        initialValues={{
          ...emptyInitialValues,
          name: 'Fone',
          slug: 'fone',
          imageUrl: 'https://cdn.example.com/original.jpg',
        }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Remover imagem' }));
    expect(screen.queryByRole('img', { name: 'Imagem do Produto' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: null })));
    expect(uploadCallCount(fetchMock)).toBe(0);
  });

  it('concorrência: dois cliques em Salvar durante o upload pendente não duplicam upload nem onSubmit', async () => {
    let resolveUpload!: (response: Response) => void;
    const pendingUpload = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    const fetchMock = jest.fn<typeof fetch>(async (input) => {
      if (String(input).includes('/uploads/images')) {
        return pendingUpload;
      }
      return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
    });
    global.fetch = fetchMock;
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    render(
      <ProductForm
        siteSlug="fastcompre"
        initialValues={{ ...emptyInitialValues, name: 'Fone', slug: 'fone' }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    const file = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Imagem'), file);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    // Segunda tentativa de clique enquanto o upload ainda está pendente —
    // `isSubmitting` já deveria bloquear tanto o botão (desabilitado) quanto
    // uma chamada direta a `handleSubmit`, então isso não deve produzir uma
    // segunda chamada de upload nem de `onSubmit`.
    await user.click(screen.getByRole('button', { name: 'Salvando...' }));

    resolveUpload(jsonResponse(201, { url: 'https://cdn.example.com/nova-imagem.jpg' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(uploadCallCount(fetchMock)).toBe(1);
  });

  it('cleanup: revoga a URL local ao trocar de arquivo, ao remover a imagem e ao desmontar', async () => {
    mockFetch({});
    const user = userEvent.setup();
    const { unmount } = render(
      <ProductForm siteSlug="fastcompre" initialValues={emptyInitialValues} submitLabel="Criar" onSubmit={jest.fn<SubmitFn>()} />,
    );

    const input = screen.getByLabelText('Imagem');
    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

    await user.upload(input, fileA);
    expect(await screen.findByRole('img', { name: 'Imagem do Produto' })).toHaveAttribute('src', 'blob:mock-1');

    await user.upload(input, fileB);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1'));
    expect(screen.getByRole('img', { name: 'Imagem do Produto' })).toHaveAttribute('src', 'blob:mock-2');

    await user.click(screen.getByRole('button', { name: 'Remover imagem' }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-2'));

    await user.upload(input, fileA);
    expect(await screen.findByRole('img', { name: 'Imagem do Produto' })).toHaveAttribute('src', 'blob:mock-3');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-3');
  });
});
