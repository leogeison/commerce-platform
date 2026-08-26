import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AdminApiError } from '../../../lib/api-error';
import { UnsavedChangesProvider } from '../unsaved-changes-context';
import { AuthorForm, type AuthorFormValues } from './author-form';

type SubmitFn = (values: AuthorFormValues) => Promise<void>;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

/**
 * Mocka `global.fetch` só para o upload de avatar (`POST` para
 * `/uploads/images`) — o único endpoint que `AuthorForm` chama por fora do
 * `onSubmit` injetado (diferente do `ProductForm`, não há Categorias para
 * buscar aqui).
 */
function mockFetch(options: { upload?: 'success' | 'fail' } = {}) {
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
      return jsonResponse(201, { url: 'https://cdn.example.com/novo-avatar.jpg' });
    }
    return jsonResponse(404, { unexpected: 'unhandled url in test mock' });
  });
  global.fetch = fetchMock;
  return fetchMock;
}

function uploadCallCount(fetchMock: jest.Mock<typeof fetch>): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes('/uploads/images')).length;
}

const emptyInitialValues: AuthorFormValues = {
  name: '',
  bio: null,
  avatarUrl: null,
};

/**
 * UXA-015 — `AuthorForm` passa a chamar `useSyncFormDirty` incondicionalmente
 * (dirty-guard, réplica do padrão já usado em `CategoryForm`/`ProductForm`/
 * `OfferForm`), então todo render deste componente exige
 * `UnsavedChangesProvider` como ancestral — mesmo critério já aplicado em
 * `offer-form.spec.tsx`.
 */
function renderForm(props: Omit<Parameters<typeof AuthorForm>[0], 'siteSlug'> & { siteSlug?: string }) {
  return render(
    <UnsavedChangesProvider>
      <AuthorForm siteSlug="fastcompre" {...props} />
    </UnsavedChangesProvider>,
  );
}

let createObjectURLCallCount = 0;

describe('AuthorForm', () => {
  beforeEach(() => {
    createObjectURLCallCount = 0;
    URL.createObjectURL = jest.fn(() => `blob:mock-${(createObjectURLCallCount += 1)}`) as typeof URL.createObjectURL;
    URL.revokeObjectURL = jest.fn() as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renderiza os valores iniciais, incluindo preview do avatar existente com alt igual ao nome', () => {
    renderForm({
      initialValues: { name: 'Ana Souza', bio: 'Editora-chefe', avatarUrl: 'https://cdn.example.com/ana.jpg' },
      submitLabel: 'Salvar',
      onSubmit: jest.fn<SubmitFn>(),
    });

    expect(screen.getByLabelText('Nome')).toHaveValue('Ana Souza');
    expect(screen.getByLabelText('Bio')).toHaveValue('Editora-chefe');
    expect(screen.getByRole('img', { name: 'Ana Souza' })).toHaveAttribute('src', 'https://cdn.example.com/ana.jpg');
  });

  it('sem avatarUrl inicial: mostra o fallback de iniciais (nunca vazio), acompanhando o nome digitado', async () => {
    const user = userEvent.setup();
    renderForm({ initialValues: emptyInitialValues, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome'), 'Ana Silva');

    expect(await screen.findByText('AS')).toBeInTheDocument();
  });

  it('nome vazio: mostra erro de campo, move o foco para o campo Nome, não chama onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>();
    renderForm({ initialValues: emptyInitialValues, submitLabel: 'Criar', onSubmit });

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submit válido com bio vazia e sem avatar: chama onSubmit com bio/avatarUrl null', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    renderForm({ initialValues: emptyInitialValues, submitLabel: 'Criar', onSubmit });

    await user.type(screen.getByLabelText('Nome'), 'Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Ana Souza', bio: null, avatarUrl: null }));
  });

  it('submit bem-sucedido: chama onSuccess depois que o formulário já está limpo (isDirty false)', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    const onSuccess = jest.fn<() => void>();
    renderForm({ initialValues: emptyInitialValues, submitLabel: 'Criar', onSubmit, onSuccess });

    await user.type(screen.getByLabelText('Nome'), 'Ana Souza');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('durante o submit (sem avatar novo): desabilita campos e botão', async () => {
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    const onSubmit = jest.fn<SubmitFn>().mockReturnValue(pending);
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Salvar', onSubmit });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvando...' })).toBeDisabled();
    expect(screen.getByLabelText('Nome')).toBeDisabled();

    resolveSubmit();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar' })).not.toBeDisabled());
  });

  it('erro de negócio no submit (409): mostra a mensagem da API', async () => {
    const user = userEvent.setup();
    const onSubmit = jest
      .fn<SubmitFn>()
      .mockRejectedValue(new AdminApiError('Este usuário já possui um Author neste Site.', { statusCode: 409 }));
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Salvar', onSubmit });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Este usuário já possui um Author neste Site.')).toBeInTheDocument();
  });

  it('erro inesperado no submit: mostra mensagem genérica fixa', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockRejectedValue(new Error('network down'));
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Salvar', onSubmit });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar o Autor. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });

  it('selecionar arquivo: mostra preview local via URL.createObjectURL, sem nenhuma chamada de rede', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

    const file = new File(['conteudo'], 'avatar.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Avatar'), file);

    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:mock-1');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(uploadCallCount(fetchMock)).toBe(0);
  });

  it('selecionar o mesmo arquivo várias vezes antes do submit: nenhuma chamada de upload é feita', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderForm({ initialValues: emptyInitialValues, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

    const file = new File(['conteudo'], 'avatar.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText('Avatar');
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
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit });

    const file = new File(['conteudo'], 'avatar.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Avatar'), file);
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ avatarUrl: 'https://cdn.example.com/novo-avatar.jpg' }),
      ),
    );
    expect(uploadCallCount(fetchMock)).toBe(1);
  });

  it('upload falha no submit: onSubmit nunca é chamado, mensagem de erro exibida, formulário volta a ficar usável', async () => {
    const fetchMock = mockFetch({ upload: 'fail' });
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit });

    const file = new File(['conteudo'], 'avatar.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Avatar'), file);
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
      .mockRejectedValueOnce(new AdminApiError('Este usuário já possui um Author neste Site.', { statusCode: 409 }))
      .mockResolvedValueOnce(undefined);
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit });

    const file = new File(['conteudo'], 'avatar.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Avatar'), file);
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Este usuário já possui um Author neste Site.')).toBeInTheDocument();
    expect(uploadCallCount(fetchMock)).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ avatarUrl: 'https://cdn.example.com/novo-avatar.jpg' }),
    );
    expect(uploadCallCount(fetchMock)).toBe(1);
  });

  it('editar sem trocar avatar: preserva o avatarUrl atual, sem chamada de upload', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    renderForm({
      initialValues: { name: 'Ana', bio: null, avatarUrl: 'https://cdn.example.com/original.jpg' },
      submitLabel: 'Salvar',
      onSubmit,
    });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ avatarUrl: 'https://cdn.example.com/original.jpg' }),
      ),
    );
    expect(uploadCallCount(fetchMock)).toBe(0);
  });

  it('remover avatar: substitui a imagem pelo fallback de iniciais e envia avatarUrl null, sem chamada de upload', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    renderForm({
      initialValues: { name: 'Ana', bio: null, avatarUrl: 'https://cdn.example.com/original.jpg' },
      submitLabel: 'Salvar',
      onSubmit,
    });

    await user.click(await screen.findByRole('button', { name: 'Remover avatar' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: null })));
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
      return jsonResponse(404, { unexpected: 'unhandled url in test mock' });
    });
    global.fetch = fetchMock;
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Salvar', onSubmit });

    const file = new File(['conteudo'], 'avatar.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Avatar'), file);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await user.click(screen.getByRole('button', { name: 'Salvando...' }));

    resolveUpload(jsonResponse(201, { url: 'https://cdn.example.com/novo-avatar.jpg' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(uploadCallCount(fetchMock)).toBe(1);
  });

  it('cleanup: revoga a URL local ao trocar de arquivo, ao remover o avatar e ao desmontar', async () => {
    const user = userEvent.setup();
    const { unmount } = renderForm({
      initialValues: { ...emptyInitialValues, name: 'Ana' },
      submitLabel: 'Criar',
      onSubmit: jest.fn<SubmitFn>(),
    });

    const input = screen.getByLabelText('Avatar');
    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

    await user.upload(input, fileA);
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:mock-1');

    await user.upload(input, fileB);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1'));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:mock-2');

    await user.click(screen.getByRole('button', { name: 'Remover avatar' }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-2'));

    await user.upload(input, fileA);
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:mock-3');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-3');
  });

  it('não tem violação de acessibilidade (jest-axe)', async () => {
    const { container } = renderForm({
      initialValues: { name: 'Ana Souza', bio: 'Editora-chefe', avatarUrl: 'https://cdn.example.com/ana.jpg' },
      submitLabel: 'Salvar',
      onSubmit: jest.fn<SubmitFn>(),
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});
