import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AdminApiError } from '../../../lib/api-error';
import { UnsavedChangesProvider } from '../unsaved-changes-context';
import type { AuthorFormValues } from './author-form';

/**
 * UXP-003 — o cropper real (`react-easy-crop`) depende de layout/medidas que
 * o jsdom não tem; aqui ele é substituído por um stub que, ao montar, já
 * informa mídia carregada, área de recorte e `croppedAreaPixels` — o
 * suficiente para exercitar o fluxo do formulário e do diálogo. A geração
 * real da imagem (canvas) também não existe no jsdom: `cropAvatarImage` é
 * substituída, e o restante do módulo (validação, `accept`) é o real. O
 * comportamento real de recorte/arraste/EXIF é coberto em browser real
 * (`e2e-a11y/author-avatar-crop.a11y.spec.ts`).
 */
jest.mock('react-easy-crop', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  function MockCropper(props: {
    initialCroppedAreaPixels?: unknown;
    cropperProps?: Record<string, unknown>;
    onMediaLoaded?: (size: unknown) => void;
    onCropSizeChange?: (size: unknown) => void;
    onCropComplete?: (area: unknown, areaPixels: unknown) => void;
    setCropperRef?: (ref: unknown) => void;
  }) {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
      props.setCropperRef?.(ref);
      props.onMediaLoaded?.({ width: 300, height: 300, naturalWidth: 1200, naturalHeight: 1200 });
      props.onCropSizeChange?.({ width: 300, height: 300 });
      props.onCropComplete?.({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 1200, height: 1200 });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement('div', {
      ref,
      tabIndex: 0,
      'data-testid': 'mock-cropper',
      'data-initial-area': JSON.stringify(props.initialCroppedAreaPixels ?? null),
      ...props.cropperProps,
    });
  }
  return { __esModule: true, default: MockCropper };
});

jest.mock('./crop-avatar-image', () => ({
  ...jest.requireActual<typeof import('./crop-avatar-image')>('./crop-avatar-image'),
  cropAvatarImage: jest.fn(),
}));

// Mesmo motivo documentado em `article-preview.spec.tsx`: neste setup de SWC
// do `next/jest`, um `import` estático do módulo mockado capturaria a
// função real — `jest.requireMock` devolve a versão mockada.
const { cropAvatarImage: cropAvatarImageMock } = jest.requireMock<{
  cropAvatarImage: jest.Mock<(sourceUrl: string, area: unknown) => Promise<File>>;
}>('./crop-avatar-image');

const CROPPED_FILE = new File(['recortado'], 'avatar.webp', { type: 'image/webp' });
// Área informada pelo stub do cropper ao montar (pixels da imagem original).
const STUB_AREA = { x: 0, y: 0, width: 1200, height: 1200 };

// `AuthorForm` é carregado por `import()` dinâmico DEPOIS dos `jest.mock`
// acima: neste setup de SWC do `next/jest` os `jest.mock` não são içados
// acima dos `import` estáticos, então um import estático de
// `./author-form` carregaria `avatar-crop-dialog` → `react-easy-crop` e
// `./crop-avatar-image` reais antes do registro dos mocks.
let AuthorForm: typeof import('./author-form').AuthorForm;

beforeAll(async () => {
  ({ AuthorForm } = await import('./author-form'));
});

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

type User = ReturnType<typeof userEvent.setup>;

/**
 * UXP-003 — selecionar um arquivo abre o cropper; o formulário só muda ao
 * "Aplicar recorte". Cada abertura cria 1 URL local (original) e cada
 * recorte aplicado cria mais 1 (preview do arquivo recortado).
 */
async function chooseAndApplyCrop(user: User, file: File) {
  await user.upload(screen.getByLabelText('Avatar'), file);
  const dialog = await screen.findByRole('dialog', { name: 'Recortar avatar' });
  await user.click(within(dialog).getByRole('button', { name: 'Aplicar recorte' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

/** `toHaveBeenCalledWith` compara `File` estruturalmente (dois `File` parecem iguais) — aqui, por identidade. */
function objectUrlCreatedFor(file: File): boolean {
  return (URL.createObjectURL as jest.Mock).mock.calls.some(([argument]) => argument === file);
}

function uploadedFile(fetchMock: jest.Mock<typeof fetch>): File {
  const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/uploads/images'));
  const body = call?.[1]?.body as FormData;
  return body.get('file') as File;
}

describe('AuthorForm', () => {
  beforeEach(() => {
    createObjectURLCallCount = 0;
    URL.createObjectURL = jest.fn(() => `blob:mock-${(createObjectURLCallCount += 1)}`) as typeof URL.createObjectURL;
    URL.revokeObjectURL = jest.fn() as typeof URL.revokeObjectURL;
    cropAvatarImageMock.mockReset();
    cropAvatarImageMock.mockResolvedValue(CROPPED_FILE);
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

  it('UXP-003 — selecionar arquivo abre o cropper sobre o original, sem alterar o formulário nem chamar a rede', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

    const file = new File(['conteudo'], 'avatar.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Avatar'), file);

    const dialog = await screen.findByRole('dialog', { name: 'Recortar avatar' });
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    // Formulário intacto enquanto o recorte não é aplicado: nenhum preview
    // novo, nenhum "Remover avatar", nenhuma rede.
    expect(screen.queryByRole('button', { name: 'Remover avatar' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'Prévia do avatar recortado' })).toBeInTheDocument();
    expect(uploadCallCount(fetchMock)).toBe(0);
  });

  it('UXP-003 — aplicar recorte: mostra preview local do arquivo recortado, sem nenhuma chamada de rede', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

    const file = new File(['conteudo'], 'avatar.jpg', { type: 'image/jpeg' });
    await chooseAndApplyCrop(user, file);

    // blob:mock-1 = original aberto no cropper; blob:mock-2 = recortado.
    expect(cropAvatarImageMock).toHaveBeenCalledWith('blob:mock-1', { x: 0, y: 0, width: 1200, height: 1200 });
    expect(URL.createObjectURL).toHaveBeenLastCalledWith(CROPPED_FILE);
    expect(await screen.findByRole('img', { name: 'Ana' })).toHaveAttribute('src', 'blob:mock-2');
    // A URL do original é revogada ao fechar o cropper.
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1'));
    expect(uploadCallCount(fetchMock)).toBe(0);
  });

  it('selecionar o mesmo arquivo várias vezes antes do submit: nenhuma chamada de upload é feita', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderForm({ initialValues: emptyInitialValues, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

    const file = new File(['conteudo'], 'avatar.jpg', { type: 'image/jpeg' });
    await chooseAndApplyCrop(user, file);
    await chooseAndApplyCrop(user, file);
    await chooseAndApplyCrop(user, file);

    // UXP-003 — 2 URLs por ciclo (original no cropper + recortado).
    expect(URL.createObjectURL).toHaveBeenCalledTimes(6);
    expect(uploadCallCount(fetchMock)).toBe(0);
  });

  it('submit com arquivo selecionado: faz upload exatamente uma vez e chama onSubmit com a URL retornada', async () => {
    const fetchMock = mockFetch({ upload: 'success' });
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit });

    const file = new File(['conteudo'], 'avatar.jpg', { type: 'image/jpeg' });
    await chooseAndApplyCrop(user, file);
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ avatarUrl: 'https://cdn.example.com/novo-avatar.jpg' }),
      ),
    );
    expect(uploadCallCount(fetchMock)).toBe(1);
    // UXP-003 — o arquivo enviado é o RECORTADO, nunca o original, pelo
    // mesmo upload `AUTHOR_AVATAR` de antes.
    expect(uploadedFile(fetchMock)).toBe(CROPPED_FILE);
    const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/uploads/images'));
    expect((call?.[1]?.body as FormData).get('purpose')).toBe('AUTHOR_AVATAR');
  });

  it('upload falha no submit: onSubmit nunca é chamado, mensagem de erro exibida, formulário volta a ficar usável', async () => {
    const fetchMock = mockFetch({ upload: 'fail' });
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit });

    const file = new File(['conteudo'], 'avatar.jpg', { type: 'image/jpeg' });
    await chooseAndApplyCrop(user, file);
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
    await chooseAndApplyCrop(user, file);
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
    await chooseAndApplyCrop(user, file);

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

    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

    // UXP-003 — cada ciclo: original no cropper (ímpar) + recortado (par).
    await chooseAndApplyCrop(user, fileA);
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:mock-2');
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1'));

    await chooseAndApplyCrop(user, fileB);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-2'));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:mock-4');

    await user.click(screen.getByRole('button', { name: 'Remover avatar' }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-4'));

    await chooseAndApplyCrop(user, fileA);
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:mock-6');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-6');
  });

  describe('UXP-003 — cropper de avatar', () => {
    it('campo de arquivo aceita só JPEG, PNG e WebP e é descrito pela orientação de formato/tamanho', () => {
      renderForm({ initialValues: emptyInitialValues, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });
      const input = screen.getByLabelText('Avatar');
      expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
      expect(input).toHaveAccessibleDescription('JPEG, PNG ou WebP, até 5 MB. Depois de escolher, você ajusta o recorte.');
    });

    it('formato não suportado: mensagem associada ao campo, cropper não abre, formulário intacto', async () => {
      const user = userEvent.setup({ applyAccept: false });
      renderForm({ initialValues: emptyInitialValues, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

      await user.upload(screen.getByLabelText('Avatar'), new File(['gif'], 'a.gif', { type: 'image/gif' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Formato de imagem não suportado. Use JPEG, PNG ou WebP.');
      expect(screen.getByLabelText('Avatar')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('arquivo original acima de 5 MiB: mensagem, cropper não abre (limite preservado também no original)', async () => {
      const user = userEvent.setup();
      renderForm({ initialValues: emptyInitialValues, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

      const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.jpg', { type: 'image/jpeg' });
      await user.upload(screen.getByLabelText('Avatar'), big);

      expect(await screen.findByRole('alert')).toHaveTextContent('A imagem deve ter no máximo 5 MB.');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('Cancelar: fecha o cropper sem alterar o formulário e devolve o foco ao campo de arquivo', async () => {
      const fetchMock = mockFetch();
      const user = userEvent.setup();
      renderForm({
        initialValues: { name: 'Ana', bio: null, avatarUrl: 'https://cdn.example.com/original.jpg' },
        submitLabel: 'Salvar',
        onSubmit: jest.fn<SubmitFn>(),
      });

      await user.upload(screen.getByLabelText('Avatar'), new File(['x'], 'x.jpg', { type: 'image/jpeg' }));
      const dialog = await screen.findByRole('dialog', { name: 'Recortar avatar' });
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByRole('img', { name: 'Ana' })).toHaveAttribute('src', 'https://cdn.example.com/original.jpg');
      expect(screen.queryByRole('button', { name: 'Ajustar recorte' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Avatar')).toHaveFocus();
      expect(cropAvatarImageMock).not.toHaveBeenCalled();
      await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1'));
      expect(uploadCallCount(fetchMock)).toBe(0);
    });

    it('Escape: mesmo efeito de Cancelar', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
      mockFetch();
      renderForm({
        initialValues: { name: 'Ana', bio: null, avatarUrl: 'https://cdn.example.com/original.jpg' },
        submitLabel: 'Salvar',
        onSubmit,
      });

      await user.upload(screen.getByLabelText('Avatar'), new File(['x'], 'x.jpg', { type: 'image/jpeg' }));
      await screen.findByRole('dialog', { name: 'Recortar avatar' });
      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByLabelText('Avatar')).toHaveFocus();

      // Nenhuma alteração: salvar preserva o avatar original, sem upload.
      await user.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ avatarUrl: 'https://cdn.example.com/original.jpg' }),
        ),
      );
    });

    it('Ajustar recorte: aparece só com recorte não salvo, reabre sobre o ORIGINAL e devolve o foco ao próprio botão', async () => {
      const user = userEvent.setup();
      renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

      expect(screen.queryByRole('button', { name: 'Ajustar recorte' })).not.toBeInTheDocument();
      const original = new File(['original'], 'foto.png', { type: 'image/png' });
      await chooseAndApplyCrop(user, original);

      const adjust = screen.getByRole('button', { name: 'Ajustar recorte' });
      await user.click(adjust);
      const dialog = await screen.findByRole('dialog', { name: 'Recortar avatar' });
      expect(URL.createObjectURL).toHaveBeenLastCalledWith(original);

      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Ajustar recorte' })).toHaveFocus();
      // Cancelar o ajuste mantém o recorte anterior.
      expect(screen.getByRole('img', { name: 'Ana' })).toHaveAttribute('src', 'blob:mock-2');
    });

    it('retomar enquadramento: "Ajustar recorte" reabre com a área do último recorte aplicado; imagem nova começa sem área', async () => {
      const user = userEvent.setup();
      renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

      await user.upload(screen.getByLabelText('Avatar'), new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
      expect(await screen.findByTestId('mock-cropper')).toHaveAttribute('data-initial-area', 'null');
      await user.click(screen.getByRole('button', { name: 'Aplicar recorte' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Ajustar recorte' }));
      expect(await screen.findByTestId('mock-cropper')).toHaveAttribute('data-initial-area', JSON.stringify(STUB_AREA));

      // Cancelar o ajuste preserva o último recorte e sua área.
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Ajustar recorte' }));
      expect(await screen.findByTestId('mock-cropper')).toHaveAttribute('data-initial-area', JSON.stringify(STUB_AREA));
    });

    it('selecionar outra imagem e cancelar preserva o avatar anterior, o original e a área do recorte', async () => {
      const user = userEvent.setup();
      renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

      const originalA = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
      await chooseAndApplyCrop(user, originalA);
      expect(screen.getByRole('img', { name: 'Ana' })).toHaveAttribute('src', 'blob:mock-2');

      await user.upload(screen.getByLabelText('Avatar'), new File(['b'], 'b.jpg', { type: 'image/jpeg' }));
      expect(await screen.findByTestId('mock-cropper')).toHaveAttribute('data-initial-area', 'null');
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      expect(screen.getByRole('img', { name: 'Ana' })).toHaveAttribute('src', 'blob:mock-2');
      await user.click(screen.getByRole('button', { name: 'Ajustar recorte' }));
      expect(URL.createObjectURL).toHaveBeenLastCalledWith(originalA);
      expect(await screen.findByTestId('mock-cropper')).toHaveAttribute('data-initial-area', JSON.stringify(STUB_AREA));
    });

    it('cancelar durante a geração: o resultado tardio não altera o formulário', async () => {
      let resolveCrop!: (file: File) => void;
      cropAvatarImageMock.mockReturnValueOnce(new Promise<File>((resolve) => (resolveCrop = resolve)));
      const fetchMock = mockFetch();
      const user = userEvent.setup();
      renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

      await user.upload(screen.getByLabelText('Avatar'), new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
      const dialog = await screen.findByRole('dialog', { name: 'Recortar avatar' });
      await user.click(within(dialog).getByRole('button', { name: 'Aplicar recorte' }));
      await within(dialog).findByRole('status');
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      resolveCrop(CROPPED_FILE);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remover avatar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ajustar recorte' })).not.toBeInTheDocument();
      expect(objectUrlCreatedFor(CROPPED_FILE)).toBe(false);
      expect(uploadCallCount(fetchMock)).toBe(0);
    });

    it('uma geração antiga (cancelada) nunca sobrescreve um recorte mais recente', async () => {
      const staleFile = new File(['antigo'], 'avatar.webp', { type: 'image/webp' });
      const newerFile = new File(['novo'], 'avatar.webp', { type: 'image/webp' });
      let resolveStale!: (file: File) => void;
      cropAvatarImageMock
        .mockReturnValueOnce(new Promise<File>((resolve) => (resolveStale = resolve)))
        .mockResolvedValueOnce(newerFile);
      const user = userEvent.setup();
      renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

      // 1ª imagem: geração fica pendente e é cancelada.
      await user.upload(screen.getByLabelText('Avatar'), new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
      let dialog = await screen.findByRole('dialog', { name: 'Recortar avatar' });
      await user.click(within(dialog).getByRole('button', { name: 'Aplicar recorte' }));
      await within(dialog).findByRole('status');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      // 2ª imagem: recorte aplicado normalmente.
      await user.upload(screen.getByLabelText('Avatar'), new File(['b'], 'b.jpg', { type: 'image/jpeg' }));
      dialog = await screen.findByRole('dialog', { name: 'Recortar avatar' });
      await user.click(within(dialog).getByRole('button', { name: 'Aplicar recorte' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      const newerPreview = screen.getByRole('img', { name: 'Ana' }).getAttribute('src');
      expect(objectUrlCreatedFor(newerFile)).toBe(true);

      // A geração antiga termina depois: descartada.
      resolveStale(staleFile);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.getByRole('img', { name: 'Ana' })).toHaveAttribute('src', newerPreview!);
      expect(objectUrlCreatedFor(staleFile)).toBe(false);
    });

    it('Ajustar recorte some depois de salvar com sucesso (avatar persistido não é recortado de novo)', async () => {
      mockFetch({ upload: 'success' });
      const user = userEvent.setup();
      const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
      renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit });

      await chooseAndApplyCrop(user, new File(['x'], 'x.jpg', { type: 'image/jpeg' }));
      await user.click(screen.getByRole('button', { name: 'Criar' }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('button', { name: 'Ajustar recorte' })).not.toBeInTheDocument();
    });

    it('Remover avatar descarta também o recorte pendente e o original (sem "Ajustar recorte")', async () => {
      const user = userEvent.setup();
      renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

      await chooseAndApplyCrop(user, new File(['x'], 'x.jpg', { type: 'image/jpeg' }));
      await user.click(screen.getByRole('button', { name: 'Remover avatar' }));

      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ajustar recorte' })).not.toBeInTheDocument();
    });

    it('falha ao gerar o recorte: alerta no diálogo, que continua aberto e utilizável; formulário intacto', async () => {
      cropAvatarImageMock.mockRejectedValueOnce(new Error('canvas'));
      const user = userEvent.setup();
      renderForm({ initialValues: { ...emptyInitialValues, name: 'Ana' }, submitLabel: 'Criar', onSubmit: jest.fn<SubmitFn>() });

      await user.upload(screen.getByLabelText('Avatar'), new File(['x'], 'x.jpg', { type: 'image/jpeg' }));
      const dialog = await screen.findByRole('dialog', { name: 'Recortar avatar' });
      await user.click(within(dialog).getByRole('button', { name: 'Aplicar recorte' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Não foi possível gerar a imagem recortada. Tente novamente.',
      );
      expect(within(dialog).getByRole('button', { name: 'Aplicar recorte' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Remover avatar' })).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Aplicar recorte' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByRole('img', { name: 'Ana' })).toHaveAttribute('src', 'blob:mock-2');
    });
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
