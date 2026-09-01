import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { $getRoot, $getSelection, $isRangeSelection, getNearestEditorFromDOMNode } from 'lexical';
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

  it('bodyMdx é editado via editor Lexical básico (UXE-006), sem toolbar/preview', async () => {
    mockFetch({});
    render(
      <ArticleForm siteSlug="fastcompre" initialValues={EMPTY_VALUES} submitLabel="Criar" onSubmit={jest.fn<() => Promise<void>>()} />,
    );

    // UXE-006 substitui o <textarea> pelo editor Lexical básico — o campo
    // continua associado ao mesmo label visível "Corpo (Markdown)", mas
    // agora como uma área de edição rica (role="textbox"), não mais um
    // <textarea> literal. Toolbar/menu "/" são UXE-007, fora de escopo.
    const editor = await screen.findByLabelText('Corpo (Markdown)');
    expect(editor.tagName).not.toBe('TEXTAREA');
    expect(editor).toHaveAttribute('role', 'textbox');
    expect(editor).toHaveAttribute('aria-multiline', 'true');
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(screen.queryByRole('button', { name: /preview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('submit sem arquivo novo: onSubmit recebe todos os campos resolvidos, incluindo bodyMdx digitado', async () => {
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
});
