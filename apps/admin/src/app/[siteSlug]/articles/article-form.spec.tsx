import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArticleForm, type ArticleFormValues } from './article-form';

const EMPTY_VALUES: ArticleFormValues = {
  type: 'REVIEW',
  title: '',
  slug: '',
  categoryId: null,
  authorId: null,
  metaDescription: null,
  bodyMdx: '',
  coverImageUrl: null,
};

function makeCategory(id: string, name: string, archivedAt: string | null = null) {
  return {
    id,
    siteId: '99999999-9999-4999-8999-999999999999',
    name,
    slug: name.toLowerCase(),
    archivedAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeAuthor(id: string, name: string) {
  return { id, siteId: '99999999-9999-4999-8999-999999999999', userId: null, name, bio: null, avatarUrl: null };
}

const ACTIVE_CATEGORY = makeCategory('aaaaaaaa-1111-4111-8111-111111111111', 'Eletrônicos');
const ARCHIVED_CATEGORY = makeCategory(
  'bbbbbbbb-2222-4222-8222-222222222222',
  'Descontinuados',
  '2026-01-02T00:00:00.000Z',
);
const AUTHOR = makeAuthor('cccccccc-3333-4333-8333-333333333333', 'Ana Reviewer');

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function categoriesResponse() {
  return jsonResponse(200, { items: [ACTIVE_CATEGORY, ARCHIVED_CATEGORY], page: 1, pageSize: 100, total: 2, totalPages: 1 });
}

function authorsResponse() {
  return jsonResponse(200, { items: [AUTHOR], page: 1, pageSize: 100, total: 1, totalPages: 1 });
}

function mockFetch(options: { categories?: () => Response; authors?: () => Response; upload?: () => Response }) {
  global.fetch = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('/categories')) {
      return options.categories ? options.categories() : categoriesResponse();
    }
    if (url.includes('/authors')) {
      return options.authors ? options.authors() : authorsResponse();
    }
    if (url.includes('/uploads/images')) {
      return options.upload ? options.upload() : jsonResponse(200, { url: 'http://localhost:9000/local-dev-bucket/cover.jpg' });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function makeFile(name = 'cover.jpg'): File {
  return new File(['fake-image-bytes'], name, { type: 'image/jpeg' });
}

describe('ArticleForm', () => {
  let createObjectURLCallCount = 0;

  beforeEach(() => {
    createObjectURLCallCount = 0;
    URL.createObjectURL = jest.fn(() => `blob:mock-${(createObjectURLCallCount += 1)}`) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = jest.fn() as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('validação: título e slug vazios impedem o submit e mostram erro', async () => {
    const user = userEvent.setup();
    mockFetch({});
    const onSubmit = jest.fn<() => Promise<void>>();
    render(<ArticleForm siteSlug="fastcompre" initialValues={EMPTY_VALUES} submitLabel="Criar" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Categorias: popula o select, oculta arquivadas exceto a já vinculada', async () => {
    mockFetch({});
    render(
      <ArticleForm
        siteSlug="fastcompre"
        initialValues={{ ...EMPTY_VALUES, categoryId: ARCHIVED_CATEGORY.id }}
        submitLabel="Criar"
        onSubmit={jest.fn<() => Promise<void>>()}
      />,
    );

    expect(await screen.findByRole('option', { name: 'Eletrônicos' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Descontinuados (arquivada)' })).toBeInTheDocument();
  });

  it('erro ao carregar Categorias: desabilita o select e mostra mensagem, sem quebrar o formulário', async () => {
    mockFetch({ categories: () => jsonResponse(500, { unexpected: 'shape' }) });
    render(
      <ArticleForm siteSlug="fastcompre" initialValues={EMPTY_VALUES} submitLabel="Criar" onSubmit={jest.fn<() => Promise<void>>()} />,
    );

    expect(await screen.findByText('Não foi possível carregar as Categorias.')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoria')).toBeDisabled();
  });

  it('Autores: popula o select', async () => {
    mockFetch({});
    render(
      <ArticleForm siteSlug="fastcompre" initialValues={EMPTY_VALUES} submitLabel="Criar" onSubmit={jest.fn<() => Promise<void>>()} />,
    );

    expect(await screen.findByRole('option', { name: 'Ana Reviewer' })).toBeInTheDocument();
  });

  it('erro ao carregar Autores: desabilita o select e mostra mensagem, sem quebrar o formulário', async () => {
    mockFetch({ authors: () => jsonResponse(500, { unexpected: 'shape' }) });
    render(
      <ArticleForm siteSlug="fastcompre" initialValues={EMPTY_VALUES} submitLabel="Criar" onSubmit={jest.fn<() => Promise<void>>()} />,
    );

    expect(await screen.findByText('Não foi possível carregar os Autores.')).toBeInTheDocument();
    expect(screen.getByLabelText('Autor')).toBeDisabled();
  });

  it('selecionar o mesmo arquivo várias vezes antes de submeter: zero uploads', async () => {
    const user = userEvent.setup();
    mockFetch({});
    render(
      <ArticleForm siteSlug="fastcompre" initialValues={EMPTY_VALUES} submitLabel="Criar" onSubmit={jest.fn<() => Promise<void>>()} />,
    );
    await screen.findByRole('option', { name: 'Ana Reviewer' });

    const input = screen.getByLabelText('Capa') as HTMLInputElement;
    const file = makeFile();
    await user.upload(input, file);
    await user.upload(input, file);
    await user.upload(input, file);

    const uploadCalls = (global.fetch as jest.Mock).mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('/uploads/images'),
    );
    expect(uploadCalls).toHaveLength(0);
    expect(screen.getByAltText('Capa do Artigo')).toBeInTheDocument();
  });

  it('submit com arquivo selecionado: exatamente 1 upload, onSubmit recebe coverImageUrl resolvida', async () => {
    const user = userEvent.setup();
    mockFetch({});
    const onSubmit = jest.fn<(values: ArticleFormValues) => Promise<void>>().mockResolvedValue(undefined);
    render(
      <ArticleForm
        siteSlug="fastcompre"
        initialValues={{ ...EMPTY_VALUES, title: 'Artigo X', slug: 'artigo-x' }}
        submitLabel="Criar"
        onSubmit={onSubmit}
      />,
    );
    await screen.findByRole('option', { name: 'Ana Reviewer' });

    await user.upload(screen.getByLabelText('Capa'), makeFile());
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const uploadCalls = (global.fetch as jest.Mock).mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('/uploads/images'),
    );
    expect(uploadCalls).toHaveLength(1);
    expect(onSubmit.mock.calls[0][0].coverImageUrl).toBe('http://localhost:9000/local-dev-bucket/cover.jpg');
  });

  it('retry após falha de persistência: upload permanece em 1, arquivo não é reenviado', async () => {
    const user = userEvent.setup();
    mockFetch({});
    const onSubmit = jest
      .fn<(values: ArticleFormValues) => Promise<void>>()
      .mockRejectedValueOnce(new Error('falha simulada de persistência'))
      .mockResolvedValueOnce(undefined);
    render(
      <ArticleForm
        siteSlug="fastcompre"
        initialValues={{ ...EMPTY_VALUES, title: 'Artigo X', slug: 'artigo-x' }}
        submitLabel="Criar"
        onSubmit={onSubmit}
      />,
    );
    await screen.findByRole('option', { name: 'Ana Reviewer' });

    await user.upload(screen.getByLabelText('Capa'), makeFile());
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    const uploadCalls = (global.fetch as jest.Mock).mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('/uploads/images'),
    );
    expect(uploadCalls).toHaveLength(1);
    expect(onSubmit.mock.calls[1][0].coverImageUrl).toBe('http://localhost:9000/local-dev-bucket/cover.jpg');
  });

  it('remover capa: limpa preview e coverImageUrl armazenada', async () => {
    const user = userEvent.setup();
    mockFetch({});
    render(
      <ArticleForm
        siteSlug="fastcompre"
        initialValues={{ ...EMPTY_VALUES, coverImageUrl: 'http://localhost:9000/local-dev-bucket/existing.jpg' }}
        submitLabel="Salvar"
        onSubmit={jest.fn<() => Promise<void>>()}
      />,
    );
    await screen.findByRole('option', { name: 'Ana Reviewer' });

    expect(screen.getByAltText('Capa do Artigo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover capa' }));

    expect(screen.queryByAltText('Capa do Artigo')).not.toBeInTheDocument();
  });

  it('bodyMdx é um textarea simples, sem nenhum botão de preview/toolbar', async () => {
    mockFetch({});
    render(
      <ArticleForm siteSlug="fastcompre" initialValues={EMPTY_VALUES} submitLabel="Criar" onSubmit={jest.fn<() => Promise<void>>()} />,
    );

    const textarea = await screen.findByLabelText('Corpo (Markdown)');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(screen.queryByRole('button', { name: /preview/i })).not.toBeInTheDocument();
  });

  it('submit sem arquivo novo: onSubmit recebe todos os campos resolvidos, incluindo bodyMdx atual', async () => {
    const user = userEvent.setup();
    mockFetch({});
    const onSubmit = jest.fn<(values: ArticleFormValues) => Promise<void>>().mockResolvedValue(undefined);
    render(
      <ArticleForm
        siteSlug="fastcompre"
        initialValues={{ ...EMPTY_VALUES, title: 'Artigo Y', slug: 'artigo-y' }}
        submitLabel="Criar"
        onSubmit={onSubmit}
      />,
    );
    await screen.findByRole('option', { name: 'Ana Reviewer' });

    await user.type(screen.getByLabelText('Corpo (Markdown)'), '# Título');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: 'Artigo Y',
      slug: 'artigo-y',
      bodyMdx: '# Título',
      categoryId: null,
      authorId: null,
    });
  });
});
