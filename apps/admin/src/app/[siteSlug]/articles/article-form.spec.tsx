import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { $getRoot, $getSelection, $isRangeSelection, getNearestEditorFromDOMNode } from 'lexical';
import { UnsavedChangesProvider, useUnsavedChangesGuard } from '../unsaved-changes-context';
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

/**
 * `ArticleForm` chama `useArticleBodyAutosave` incondicionalmente (UXE-008),
 * que por sua vez chama `useSyncPendingSave` — exige `UnsavedChangesProvider`,
 * mesmo padrão de wrapper obrigatório já usado em `category-form.spec.tsx`/
 * `product-form.spec.tsx`/`author-form.spec.tsx`. Todo teste deste arquivo
 * passa por este helper, mesmo os que não exercitam autosave/guard
 * diretamente.
 */
function renderArticleForm(props: Parameters<typeof ArticleForm>[0]) {
  return render(
    <UnsavedChangesProvider>
      <ArticleForm {...props} />
    </UnsavedChangesProvider>,
  );
}

function ConfirmProbe() {
  const { confirmLeave } = useUnsavedChangesGuard();
  return (
    <button
      type="button"
      onClick={() => {
        void confirmLeave();
      }}
    >
      Tentar sair
    </button>
  );
}

/**
 * Mesmo critério de `renderProductFormWithGuard` (`product-form.spec.tsx`):
 * monta `ArticleForm` junto de um `ConfirmProbe` capaz de acionar
 * `confirmLeave()` — usado pelos testes de guard de pending-save (UXE-008).
 */
function renderArticleFormWithGuard(props: Parameters<typeof ArticleForm>[0]) {
  return render(
    <UnsavedChangesProvider>
      <ArticleForm {...props} />
      <ConfirmProbe />
    </UnsavedChangesProvider>,
  );
}

/**
 * Helper de teste ESTRITO A ESTA ÁREA (Artigos) — não uma abstração
 * compartilhada nova.
 *
 * Causa raiz COMPROVADA por diagnóstico instrumentado (executado
 * localmente pelo usuário, não nesta sessão): com `bodyMdx` inicial
 * vazio, `jsdom`/`@testing-library/user-event` NÃO CONSEGUE produzir a
 * primeira inserção de caractere num editor Lexical estruturalmente
 * vazio (`<p><br data-lexical-managed-linebreak="true"></p>`, sem
 * nenhum nó de texto ainda). Isso foi isolado com um teste de
 * diagnóstico temporário em `ArticleBodyEditor` isolado (sem
 * `ArticleForm` no meio): mesmo após posicionar a seleção pela API
 * pública do Lexical (`$getRoot().selectStart()` via
 * `editor.update(..., { discrete: true })`), `user.keyboard(...)`
 * resultava em 0 chamadas a `onChange` e `editor.textContent`
 * permanecia `""` — ou seja, a quebra é upstream, na simulação de
 * teclado do `jsdom`/`user-event` para esse caso específico (primeiro
 * caractere em editor vazio), não em `ChangeTrackerPlugin`,
 * `ArticleBodyEditor` ou `ArticleForm`. Validação manual num navegador
 * real confirma que a digitação num editor vazio funciona
 * normalmente em produção.
 *
 * Diante disso, este teste para de tentar emular a digitação via
 * `user.keyboard` para o caractere inicial e usa, em vez disso, a API
 * PÚBLICA e real do Lexical para inserir o texto diretamente no
 * modelo: `getNearestEditorFromDOMNode` (exportado por `lexical`)
 * recupera a instância real do `LexicalEditor` já montada por
 * `ArticleBodyEditor` a partir do próprio elemento `contentEditable`
 * renderizado — nenhum ref novo foi adicionado à produção.
 * `editor.update(..., { discrete: true })` (mesmo padrão já usado em
 * `product-block.spec.ts`) executa `$getRoot().selectStart()` seguido
 * de `$getSelection()`/`$isRangeSelection()`/`RangeSelection.insertText()`
 * — todas APIs públicas de `lexical`, o mesmo caminho que qualquer
 * código de produção usaria para inserir texto programaticamente. Por
 * rodar de forma síncrona (`discrete: true`), o reconciler real do
 * Lexical processa essa mutação normalmente, e o `OnChangePlugin` +
 * `ChangeTrackerPlugin` REAIS (nenhum deles mockado) propagam a
 * mudança para `ArticleBodyEditor.onChange` → `ArticleForm.setBodyMdx`
 * exatamente como propagariam para uma edição feita por teclado real.
 *
 * A divisão de cobertura resultante é deliberada:
 *   - interação por teclado real (`user.keyboard`) sobre conteúdo
 *     EXISTENTE (não vazio): `article-body-editor.spec.tsx`;
 *   - primeira digitação num editor totalmente vazio: validada
 *     manualmente num navegador real, porque `jsdom`/`user-event` não
 *     modela esse caminho específico;
 *   - integração Lexical real → `onChange` real → estado do
 *     `ArticleForm` → submit: este arquivo, agora via inserção a nível
 *     de modelo (API pública do Lexical) para o cenário de editor
 *     vazio, preservando toda a cadeia real a partir da mutação do
 *     editor (nenhum `onChange` é chamado diretamente, nenhum
 *     `textContent`/`fireEvent.input` é usado, e o editor não é
 *     mockado).
 */
function insertTextIntoEmptyLexicalEditor(editorRoot: HTMLElement, text: string): void {
  const editor = getNearestEditorFromDOMNode(editorRoot);
  if (!editor) {
    throw new Error('insertTextIntoEmptyLexicalEditor: nenhuma instância de LexicalEditor encontrada a partir do DOM.');
  }
  editor.update(
    () => {
      $getRoot().selectStart();
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertText(text);
      }
    },
    { discrete: true },
  );
}

/**
 * Mesma causa raiz e mesma estratégia de `insertTextIntoEmptyLexicalEditor`
 * (ver o racional completo lá) — `jsdom`/`user-event` não simula de forma
 * confiável a edição de um editor Lexical real, então a inserção usa a API
 * pública do Lexical diretamente. A diferença: esta variante é para uma
 * SEGUNDA edição sobre um editor JÁ NÃO VAZIO (ex.: os testes de
 * coordenação autosave × Salvar manual, que fazem uma segunda edição depois
 * da primeira já ter propagado). `selectStart()` sempre posiciona o cursor
 * no INÍCIO do documento — correto só para a primeira inserção num editor
 * vazio; reaproveitado para uma segunda edição, ele PREPENDA o texto novo
 * em vez de acrescentá-lo ao final (mesma classe de limitação de seleção/
 * cursor do jsdom já documentada na UXE-006, não um bug de produção).
 * `$getRoot().selectEnd()` (API pública do Lexical, simétrica a
 * `selectStart()`) posiciona a seleção no FINAL do documento, garantindo
 * que `insertText` acrescente o texto no lugar certo, de forma
 * determinística.
 */
function appendTextToLexicalEditor(editorRoot: HTMLElement, text: string): void {
  const editor = getNearestEditorFromDOMNode(editorRoot);
  if (!editor) {
    throw new Error('appendTextToLexicalEditor: nenhuma instância de LexicalEditor encontrada a partir do DOM.');
  }
  editor.update(
    () => {
      $getRoot().selectEnd();
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertText(text);
      }
    },
    { discrete: true },
  );
}

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

/**
 * UXE-008 — `id` fixo de um Artigo já persistido, usado só pelos testes de
 * autosave/guard (`articleId` fornecido a `ArticleForm`). Nenhum dos testes
 * anteriores a esta tarefa passa `articleId`, então nunca atinge este
 * branch de `mockFetch`.
 */
const PERSISTED_ARTICLE_ID = 'dddddddd-4444-4444-8444-444444444444';

function articlePatchResponse(bodyMdx: string): Response {
  return jsonResponse(200, {
    id: PERSISTED_ARTICLE_ID,
    siteId: '99999999-9999-4999-8999-999999999999',
    categoryId: null,
    authorId: null,
    type: 'REVIEW',
    status: 'DRAFT',
    title: 'Artigo existente',
    slug: 'artigo-existente',
    metaDescription: null,
    coverImageUrl: null,
    bodyMdx,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}

function mockFetch(options: {
  categories?: () => Response;
  authors?: () => Response;
  upload?: () => Response;
  articlePatch?: (bodyMdx: string) => Response;
}) {
  global.fetch = jest.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.includes('/categories')) {
      return options.categories ? options.categories() : categoriesResponse();
    }
    if (url.includes('/authors')) {
      return options.authors ? options.authors() : authorsResponse();
    }
    if (url.includes('/uploads/images')) {
      return options.upload ? options.upload() : jsonResponse(200, { url: 'http://localhost:9000/local-dev-bucket/cover.jpg' });
    }
    if (method === 'PATCH' && url.includes(`/articles/${PERSISTED_ARTICLE_ID}`)) {
      const parsedBody: { bodyMdx?: string } = init?.body ? JSON.parse(String(init.body)) : {};
      const bodyMdx = parsedBody.bodyMdx ?? '';
      return options.articlePatch ? options.articlePatch(bodyMdx) : articlePatchResponse(bodyMdx);
    }
    throw new Error(`unexpected fetch: ${url} (${method})`);
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
    renderArticleForm({ siteSlug: 'fastcompre', initialValues: EMPTY_VALUES, submitLabel: 'Criar', onSubmit });

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Categorias: popula o select, oculta arquivadas exceto a já vinculada', async () => {
    mockFetch({});
    renderArticleForm({
      siteSlug: 'fastcompre',
      initialValues: { ...EMPTY_VALUES, categoryId: ARCHIVED_CATEGORY.id },
      submitLabel: 'Criar',
      onSubmit: jest.fn<() => Promise<void>>(),
    });

    expect(await screen.findByRole('option', { name: 'Eletrônicos' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Descontinuados (arquivada)' })).toBeInTheDocument();
  });

  it('erro ao carregar Categorias: desabilita o select e mostra mensagem, sem quebrar o formulário', async () => {
    mockFetch({ categories: () => jsonResponse(500, { unexpected: 'shape' }) });
    renderArticleForm({
      siteSlug: 'fastcompre',
      initialValues: EMPTY_VALUES,
      submitLabel: 'Criar',
      onSubmit: jest.fn<() => Promise<void>>(),
    });

    expect(await screen.findByText('Não foi possível carregar as Categorias.')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoria')).toBeDisabled();
  });

  it('Autores: popula o select', async () => {
    mockFetch({});
    renderArticleForm({
      siteSlug: 'fastcompre',
      initialValues: EMPTY_VALUES,
      submitLabel: 'Criar',
      onSubmit: jest.fn<() => Promise<void>>(),
    });

    expect(await screen.findByRole('option', { name: 'Ana Reviewer' })).toBeInTheDocument();
  });

  it('erro ao carregar Autores: desabilita o select e mostra mensagem, sem quebrar o formulário', async () => {
    mockFetch({ authors: () => jsonResponse(500, { unexpected: 'shape' }) });
    renderArticleForm({
      siteSlug: 'fastcompre',
      initialValues: EMPTY_VALUES,
      submitLabel: 'Criar',
      onSubmit: jest.fn<() => Promise<void>>(),
    });

    expect(await screen.findByText('Não foi possível carregar os Autores.')).toBeInTheDocument();
    expect(screen.getByLabelText('Autor')).toBeDisabled();
  });

  it('selecionar o mesmo arquivo várias vezes antes de submeter: zero uploads', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderArticleForm({
      siteSlug: 'fastcompre',
      initialValues: EMPTY_VALUES,
      submitLabel: 'Criar',
      onSubmit: jest.fn<() => Promise<void>>(),
    });
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
    renderArticleForm({
      siteSlug: 'fastcompre',
      initialValues: { ...EMPTY_VALUES, title: 'Artigo X', slug: 'artigo-x' },
      submitLabel: 'Criar',
      onSubmit,
    });
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
    renderArticleForm({
      siteSlug: 'fastcompre',
      initialValues: { ...EMPTY_VALUES, title: 'Artigo X', slug: 'artigo-x' },
      submitLabel: 'Criar',
      onSubmit,
    });
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
    renderArticleForm({
      siteSlug: 'fastcompre',
      initialValues: { ...EMPTY_VALUES, coverImageUrl: 'http://localhost:9000/local-dev-bucket/existing.jpg' },
      submitLabel: 'Salvar',
      onSubmit: jest.fn<() => Promise<void>>(),
    });
    await screen.findByRole('option', { name: 'Ana Reviewer' });

    expect(screen.getByAltText('Capa do Artigo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover capa' }));

    expect(screen.queryByAltText('Capa do Artigo')).not.toBeInTheDocument();
  });

  it('bodyMdx é editado via editor Lexical básico com toolbar (UXE-006/UXE-007)', async () => {
    mockFetch({});
    renderArticleForm({
      siteSlug: 'fastcompre',
      initialValues: EMPTY_VALUES,
      submitLabel: 'Criar',
      onSubmit: jest.fn<() => Promise<void>>(),
    });

    // UXE-006 substitui o <textarea> pelo editor Lexical básico — o campo
    // continua associado ao mesmo label visível "Corpo (Markdown)", mas
    // agora como uma área de edição rica (role="textbox"), não mais um
    // <textarea> literal. UXE-007 acrescenta a toolbar de formatação (a
    // ausência dela era o comportamento antigo, pré-UXE-007 — agora ela é
    // exigida).
    //
    // O botão de preview (UXE-009, `ArticlePreview`) passou a existir
    // deliberadamente neste formulário — a asserção que exigia sua
    // ausência aqui ficou obsoleta e foi removida; o comportamento do
    // preview em si (abrir/fechar, conteúdo compilado, obsolescência,
    // erro) é coberto em `article-preview.spec.tsx`, não aqui.
    const editor = await screen.findByLabelText('Corpo (Markdown)');
    expect(editor.tagName).not.toBe('TEXTAREA');
    expect(editor).toHaveAttribute('role', 'textbox');
    expect(editor).toHaveAttribute('aria-multiline', 'true');
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(screen.getByRole('toolbar', { name: 'Formatação do corpo do Artigo' })).toBeInTheDocument();
  });

  it('submit sem arquivo novo: onSubmit recebe todos os campos resolvidos, incluindo bodyMdx digitado', async () => {
    const user = userEvent.setup();
    mockFetch({});
    const onSubmit = jest.fn<(values: ArticleFormValues) => Promise<void>>().mockResolvedValue(undefined);
    renderArticleForm({
      siteSlug: 'fastcompre',
      initialValues: { ...EMPTY_VALUES, title: 'Artigo Y', slug: 'artigo-y' },
      submitLabel: 'Criar',
      onSubmit,
    });
    await screen.findByRole('option', { name: 'Ana Reviewer' });

    // Texto simples, sem sintaxe Markdown ambígua — a criação de
    // heading/lista/link via atalho de teclado não é infraestrutura desta
    // tarefa (UXE-007); a cobertura de importação/edição/exportação de
    // heading/lista/link/ênfase existentes vive em
    // `article-body-editor.spec.tsx`.
    const bodyEditor = screen.getByLabelText('Corpo (Markdown)');
    // Foco real (clique real), preservando o comportamento real do
    // editor. Ver o racional completo em `insertTextIntoEmptyLexicalEditor`
    // (causa raiz comprovada: `jsdom`/`user-event` não consegue simular a
    // primeira digitação num editor Lexical estruturalmente vazio) — por
    // isso a inserção do texto usa a API pública do Lexical diretamente,
    // em vez de `user.keyboard`, apenas para este cenário de editor vazio.
    await user.click(bodyEditor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(bodyEditor, 'Texto do corpo do artigo.');
    });

    // Espera determinística pela propagação real: Lexical (reconciler) →
    // OnChangePlugin real → ChangeTrackerPlugin real →
    // ArticleBodyEditor.onChange real → ArticleForm.setBodyMdx, antes de
    // prosseguir para o submit.
    await waitFor(() => expect(bodyEditor).toHaveTextContent('Texto do corpo do artigo.'));

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: 'Artigo Y',
      slug: 'artigo-y',
      bodyMdx: 'Texto do corpo do artigo.',
      categoryId: null,
      authorId: null,
    });
  });

  // --- UXE-008: autosave de bodyMdx (só Artigo já persistido) ---

  it(
    'UXE-008: edição de bodyMdx dispara PATCH parcial após debounce, indicador "Salvando..." → "Salvo", e a saída fica liberada depois do sucesso',
    async () => {
      const user = userEvent.setup();
      // CORRIGIDO: o `articlePatchResponse` default resolve quase
      // instantaneamente (mesma causa raiz de `use-article-body-autosave.
      // spec.tsx`), deixando "Salvando..." curto demais para o
      // `findByText`/`waitFor` (timers reais) observarem de forma
      // determinística — o React pode colapsar o estado direto em "Salvo".
      // Este teste controla explicitamente a Promise do PATCH de autosave,
      // mantendo-o em voo até "Salvando..." ser observado — mesmo critério
      // já usado nos testes de coordenação autosave × Salvar manual deste
      // arquivo.
      let resolveAutosavePatch: (() => void) | undefined;
      const autosavePatchGate = new Promise<void>((resolve) => {
        resolveAutosavePatch = resolve;
      });
      mockFetch({
        articlePatch: (bodyMdx) =>
          ({
            ok: true,
            status: 200,
            text: async () => {
              await autosavePatchGate;
              return JSON.stringify({
                id: PERSISTED_ARTICLE_ID,
                siteId: '99999999-9999-4999-8999-999999999999',
                categoryId: null,
                authorId: null,
                type: 'REVIEW',
                status: 'DRAFT',
                title: 'Artigo existente',
                slug: 'artigo-existente',
                metaDescription: null,
                coverImageUrl: null,
                bodyMdx,
                publishedAt: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              });
            },
          }) as unknown as Response,
      });
      renderArticleFormWithGuard({
        siteSlug: 'fastcompre',
        articleId: PERSISTED_ARTICLE_ID,
        initialValues: EMPTY_VALUES,
        submitLabel: 'Salvar',
        onSubmit: jest.fn<() => Promise<void>>(),
      });
      await screen.findByRole('option', { name: 'Ana Reviewer' });

      const bodyEditor = screen.getByLabelText('Corpo (Markdown)');
      await user.click(bodyEditor);
      act(() => {
        insertTextIntoEmptyLexicalEditor(bodyEditor, 'Texto autosave.');
      });
      await waitFor(() => expect(bodyEditor).toHaveTextContent('Texto autosave.'));

      // CORRIGIDO (UXE-008): mesmo enquanto o debounce ainda não estourou
      // e nenhum PATCH foi enviado ainda, a edição já é um salvamento
      // pendente — o guard bloqueia a saída imediatamente. Isso NÃO
      // significa "dirty por tecla" abrindo diálogo sozinho: o diálogo só
      // aparece quando uma navegação é de fato tentada, o que este teste
      // faz explicitamente a seguir.
      expect(
        (global.fetch as jest.Mock).mock.calls.filter((call: unknown[]) => String(call[0]).includes('/articles/')),
      ).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ficar' }));

      const indicator = await screen.findByText('Salvando...', {}, { timeout: 3000 });
      expect(indicator).toBeInTheDocument();

      // Salvamento em voo: saída continua bloqueada (diálogo aparece).
      await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ficar' }));

      // Libera o PATCH em voo.
      resolveAutosavePatch?.();

      await screen.findByText('Salvo', {}, { timeout: 3000 });
      const patchCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (call: unknown[]) => String(call[0]).includes('/articles/') && (call[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCalls).toHaveLength(1);
      expect(JSON.parse(String((patchCalls[0][1] as RequestInit).body))).toEqual({ bodyMdx: 'Texto autosave.' });

      // Depois do sucesso completo, o guard fica inativo: saída liberada
      // sem diálogo.
      await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
    10000,
  );

  it(
    'UXE-008: falha no autosave mostra indicador de falha e mantém a saída bloqueada até uma nova edição salvar com sucesso',
    async () => {
      const user = userEvent.setup();
      mockFetch({ articlePatch: () => jsonResponse(500, { message: 'erro simulado' }) });
      renderArticleFormWithGuard({
        siteSlug: 'fastcompre',
        articleId: PERSISTED_ARTICLE_ID,
        initialValues: EMPTY_VALUES,
        submitLabel: 'Salvar',
        onSubmit: jest.fn<() => Promise<void>>(),
      });
      await screen.findByRole('option', { name: 'Ana Reviewer' });

      const bodyEditor = screen.getByLabelText('Corpo (Markdown)');
      await user.click(bodyEditor);
      act(() => {
        insertTextIntoEmptyLexicalEditor(bodyEditor, 'Texto que falha.');
      });
      await waitFor(() => expect(bodyEditor).toHaveTextContent('Texto que falha.'));

      await screen.findByText(
        'Não foi possível salvar automaticamente. A próxima edição tentará salvar de novo.',
        {},
        { timeout: 3000 },
      );

      // Falha não resolvida: saída continua bloqueada (sem nenhuma nova
      // edição, e sem nenhum retry automático).
      await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ficar' }));

      // Uma edição real depois da falha reabre o ciclo debounce → save.
      mockFetch({});
      act(() => {
        appendTextToLexicalEditor(bodyEditor, ' Corrigido.');
      });
      await waitFor(() => expect(bodyEditor).toHaveTextContent('Texto que falha. Corrigido.'));

      await screen.findByText('Salvo', {}, { timeout: 3000 });
      await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
    10000,
  );

  it(
    'UXE-008: Salvar manual enquanto autosave está em voo — o PATCH manual usa o bodyMdx mais recente, ocorre por último, nenhum autosave antigo/redundante é enviado depois, e o sucesso manual libera o guard',
    async () => {
      const user = userEvent.setup();
      let resolveAutosavePatch: (() => void) | undefined;
      const autosavePatchGate = new Promise<void>((resolve) => {
        resolveAutosavePatch = resolve;
      });
      let autosavePatchCallCount = 0;

      mockFetch({
        articlePatch: (bodyMdx) => {
          autosavePatchCallCount += 1;
          return {
            ok: true,
            status: 200,
            text: async () => {
              await autosavePatchGate;
              return JSON.stringify({
                id: PERSISTED_ARTICLE_ID,
                siteId: '99999999-9999-4999-8999-999999999999',
                categoryId: null,
                authorId: null,
                type: 'REVIEW',
                status: 'DRAFT',
                title: 'Artigo Z',
                slug: 'artigo-z',
                metaDescription: null,
                coverImageUrl: null,
                bodyMdx,
                publishedAt: null,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              });
            },
          } as unknown as Response;
        },
      });

      const onSubmit = jest.fn<(values: ArticleFormValues) => Promise<void>>().mockResolvedValue(undefined);
      renderArticleFormWithGuard({
        siteSlug: 'fastcompre',
        articleId: PERSISTED_ARTICLE_ID,
        initialValues: { ...EMPTY_VALUES, title: 'Artigo Z', slug: 'artigo-z' },
        submitLabel: 'Salvar',
        onSubmit,
      });
      await screen.findByRole('option', { name: 'Ana Reviewer' });

      const bodyEditor = screen.getByLabelText('Corpo (Markdown)');
      await user.click(bodyEditor);
      act(() => {
        insertTextIntoEmptyLexicalEditor(bodyEditor, 'Texto autosave em voo.');
      });
      await waitFor(() => expect(bodyEditor).toHaveTextContent('Texto autosave em voo.'));

      // Debounce estoura, o autosave dispara e fica preso no gate
      // controlado por este teste (ainda "em voo").
      await screen.findByText('Salvando...', {}, { timeout: 3000 });
      expect(autosavePatchCallCount).toBe(1);

      // Nova edição enquanto o autosave anterior ainda está em voo — este
      // valor (mais recente) é o que o Salvar manual deve enviar, e o
      // debounce que essa edição agenda deve ser cancelado pelo
      // `beginManualSave` acionado a seguir, sem gerar um segundo PATCH de
      // autosave.
      act(() => {
        appendTextToLexicalEditor(bodyEditor, ' Editado antes do Salvar.');
      });
      await waitFor(() =>
        expect(bodyEditor).toHaveTextContent('Texto autosave em voo. Editado antes do Salvar.'),
      );

      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      // Enquanto o autosave anterior segue em voo, o submit manual
      // (`onSubmit`) ainda não pode ter sido chamado: `beginManualSave`
      // aguarda esse autosave terminar primeiro, garantindo que o save
      // manual seja sempre a última escrita.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onSubmit).not.toHaveBeenCalled();

      // Libera o autosave em voo.
      resolveAutosavePatch?.();

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      // O conteúdo enviado pelo Salvar manual é o bodyMdx mais recente, não
      // o valor antigo que o autosave em voo tinha capturado.
      expect(onSubmit.mock.calls[0][0].bodyMdx).toBe('Texto autosave em voo. Editado antes do Salvar.');

      // Nenhum autosave adicional (antigo ou redundante) foi enviado: só
      // existiu o único PATCH de autosave que já estava em voo antes do
      // clique em Salvar — a segunda edição não gerou um PATCH próprio,
      // porque seu debounce foi cancelado por `beginManualSave`.
      expect(autosavePatchCallCount).toBe(1);

      // Sucesso manual sincroniza o autosave com o bodyMdx atual: guard
      // libera e nenhum autosave redundante é agendado depois.
      await screen.findByText('Salvo', {}, { timeout: 3000 });
      expect(autosavePatchCallCount).toBe(1);
      await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
    10000,
  );

  it(
    'UXE-008: autosave em voo falha depois que o usuário já acionou Salvar — onSubmit manual ainda é executado com o bodyMdx mais recente, e o sucesso manual libera o guard',
    async () => {
      const user = userEvent.setup();
      let resolveAutosaveFailure: (() => void) | undefined;
      const autosaveFailureGate = new Promise<void>((resolve) => {
        resolveAutosaveFailure = resolve;
      });
      let autosavePatchCallCount = 0;

      mockFetch({
        articlePatch: () => {
          autosavePatchCallCount += 1;
          return {
            ok: false,
            status: 500,
            text: async () => {
              await autosaveFailureGate;
              return JSON.stringify({ message: 'erro simulado em voo' });
            },
          } as unknown as Response;
        },
      });

      const onSubmit = jest.fn<(values: ArticleFormValues) => Promise<void>>().mockResolvedValue(undefined);
      renderArticleFormWithGuard({
        siteSlug: 'fastcompre',
        articleId: PERSISTED_ARTICLE_ID,
        initialValues: { ...EMPTY_VALUES, title: 'Artigo Z', slug: 'artigo-z' },
        submitLabel: 'Salvar',
        onSubmit,
      });
      await screen.findByRole('option', { name: 'Ana Reviewer' });

      const bodyEditor = screen.getByLabelText('Corpo (Markdown)');
      await user.click(bodyEditor);
      act(() => {
        insertTextIntoEmptyLexicalEditor(bodyEditor, 'Texto que vai falhar em voo.');
      });
      await waitFor(() => expect(bodyEditor).toHaveTextContent('Texto que vai falhar em voo.'));

      // Debounce estoura, o autosave dispara e fica preso no gate
      // controlado por este teste (ainda "em voo", mas vai falhar).
      await screen.findByText('Salvando...', {}, { timeout: 3000 });
      expect(autosavePatchCallCount).toBe(1);

      // Edição adicional antes de clicar em Salvar — o valor mais recente
      // é o que o submit manual deve enviar.
      act(() => {
        appendTextToLexicalEditor(bodyEditor, ' Ainda editando.');
      });
      await waitFor(() =>
        expect(bodyEditor).toHaveTextContent('Texto que vai falhar em voo. Ainda editando.'),
      );

      // Usuário aciona Salvar enquanto o autosave (que ainda vai falhar)
      // segue em voo.
      await user.click(screen.getByRole('button', { name: 'Salvar' }));

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onSubmit).not.toHaveBeenCalled();

      // O autosave em voo agora falha.
      resolveAutosaveFailure?.();

      // CORRIGIDO: a falha do autosave anterior NÃO impede o submit
      // manual — `beginManualSave` espera por settlement, não por
      // sucesso. `onSubmit` ainda é executado, com o bodyMdx mais
      // recente, e nenhum novo autosave é disparado no meio tempo.
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0].bodyMdx).toBe('Texto que vai falhar em voo. Ainda editando.');
      expect(autosavePatchCallCount).toBe(1);

      // Sucesso manual libera o guard, mesmo depois da falha do autosave
      // anterior.
      await screen.findByText('Salvo', {}, { timeout: 3000 });
      await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
    10000,
  );

  it('UXE-008: /articles/new (sem articleId) nunca dispara autosave nem bloqueia a saída', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderArticleFormWithGuard({
      siteSlug: 'fastcompre',
      initialValues: EMPTY_VALUES,
      submitLabel: 'Criar',
      onSubmit: jest.fn<() => Promise<void>>(),
    });
    await screen.findByRole('option', { name: 'Ana Reviewer' });

    const bodyEditor = screen.getByLabelText('Corpo (Markdown)');
    await user.click(bodyEditor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(bodyEditor, 'Rascunho ainda não persistido.');
    });
    await waitFor(() => expect(bodyEditor).toHaveTextContent('Rascunho ainda não persistido.'));

    // Sem `articleId`, o hook nunca agenda nem envia PATCH — nenhuma
    // criação implícita de rascunho. Não há debounce a esperar: a ausência
    // de `articleId` decide isso de forma síncrona, então a asserção não
    // depende de aguardar tempo nenhum.
    expect(
      (global.fetch as jest.Mock).mock.calls.filter((call: unknown[]) => String(call[0]).includes('/articles/')),
    ).toHaveLength(0);
    expect(screen.queryByText('Salvando...')).not.toBeInTheDocument();
    expect(screen.queryByText('Salvo')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
