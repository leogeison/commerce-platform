/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-slash-menu.spec.tsx
 *
 * UXE-007 — Toolbar e menu de comando `/`.
 *
 * Testa `ArticleBodySlashMenu` sempre através de `ArticleBodyEditor`
 * completo (não isolado) — mesmo racional de `article-body-toolbar.spec.tsx`.
 *
 * Inserção do gatilho "/" (e da query completa) usa a mesma estratégia já
 * aprovada em `create-article.spec.tsx` (UXE-006, correção de regressão
 * desta sessão): `user.type()` num `contentEditable` estruturalmente vazio
 * não é confiável no jsdom (limitação de `@testing-library/user-event`
 * documentada e comprovada naquela correção) — a inserção usa a API
 * pública do Lexical (`getNearestEditorFromDOMNode` + seleção +
 * `insertText`) dentro de `editor.update(..., { discrete: true })`, com
 * `user.click()` real estabelecendo o foco antes.
 *
 * Consultas de filtro evitam caracteres acentuados (`í` de "Título") de
 * propósito — `matchesQuery` (reaproveitada de `command-palette.tsx`) faz
 * subsequência ordenada só após `.toLowerCase()`, sem normalizar acentos;
 * "tit" não bateria com "Título" por causa do "í". "lista"/"numerada" são
 * consultas ASCII simples e não ambíguas para este conjunto de itens.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { $getRoot, $getSelection, $isRangeSelection, getNearestEditorFromDOMNode } from 'lexical';
import { ArticleBodyEditor } from './article-body-editor';
import { ProductLookupProvider } from './product-lookup-context';

const PRODUCT_DISABLED_REASON = 'salve o Artigo antes de inserir um bloco de Produto.';

/**
 * UXE-011 — sem `ProductLookupProvider` envolvendo o teste,
 * `useProductLookup()` devolve o valor default do Context
 * (`overallStatus: 'unavailable'`) — o mesmo estado real de
 * `/articles/new` antes de o Artigo ser persistido. Por isso a maioria dos
 * testes deste arquivo (herdados da UXE-007/010, sem Provider) já exercita
 * exatamente esse caso: "Bloco Produto-Oferta" sempre presente no menu,
 * sempre com `disabledReason` preenchido. Só o teste dedicado ao estado
 * disponível, mais abaixo, usa `renderEditorWithLinkedProduct` (Provider
 * real + fetch mockado).
 */
async function renderEditor(props: Partial<React.ComponentProps<typeof ArticleBodyEditor>> = {}) {
  const onChange = props.onChange ?? jest.fn();
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <>
        <label id="article-body-label" htmlFor="article-body">
          Corpo (Markdown)
        </label>
        <ArticleBodyEditor
          id="article-body"
          labelId="article-body-label"
          siteSlug={props.siteSlug ?? 'fastcompre'}
          initialValue={props.initialValue ?? ''}
          onChange={onChange}
          disabled={props.disabled}
        />
      </>,
    );
  });
  return { ...utils, onChange };
}

async function renderEditorWithLinkedProduct() {
  const productId = 'aaaaaaaa-1111-4111-8111-111111111111';
  global.fetch = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    const ok = (body: unknown) => ({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) }) as Response;
    if (url.endsWith('/products')) {
      return ok({ productIds: [productId] });
    }
    return ok({
      items: [
        {
          id: productId,
          siteId: '22222222-2222-4222-8222-222222222222',
          categoryId: null,
          name: 'Fone Bluetooth',
          slug: 'fone-bluetooth',
          description: null,
          imageUrl: null,
          archivedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    });
  });

  const onChange = jest.fn();
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <ProductLookupProvider siteSlug="fastcompre" articleId="11111111-1111-4111-8111-111111111111">
        <label id="article-body-label" htmlFor="article-body">
          Corpo (Markdown)
        </label>
        <ArticleBodyEditor id="article-body" labelId="article-body-label" siteSlug="fastcompre" initialValue="" onChange={onChange} />
      </ProductLookupProvider>,
    );
  });
  // Espera a fonte compartilhada resolver antes do teste prosseguir — do
  // contrário o item nasceria com `disabledReason` (status ainda
  // 'loading') e o teste ficaria dependente de timing.
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  return { ...utils, onChange, productId };
}

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

describe('ArticleBodySlashMenu', () => {
  it('digitar "/" no início de um bloco vazio abre o menu com as 7 capacidades disponíveis (Bloco Produto-Oferta sempre presente — desabilitado aqui por não haver Artigo persistido, UXE-011)', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '' });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/');
    });

    const listbox = await screen.findByRole('listbox', { name: 'Inserir bloco' });
    const options = await waitFor(() => {
      const found = screen.getAllByRole('option');
      expect(found).toHaveLength(7);
      return found;
    });
    expect(options.map((option) => option.textContent)).toEqual([
      'Título 1',
      'Título 2',
      'Título 3',
      'Lista',
      'Lista numerada',
      'Imagem',
      `Bloco Produto-Oferta — ${PRODUCT_DISABLED_REASON}`,
    ]);
    // Vínculo de combobox: `aria-autocomplete`/`aria-controls`/
    // `aria-activedescendant` SÃO permitidos em `role="textbox"` (ARIA
    // 1.2) — só `aria-expanded`/`aria-haspopup` não são (comprovado por
    // Axe). Ver doc comment de `article-body-slash-menu.tsx`.
    expect(editor).not.toHaveAttribute('aria-expanded');
    expect(editor).not.toHaveAttribute('aria-haspopup');
    expect(editor).toHaveAttribute('aria-autocomplete', 'list');
    expect(editor).toHaveAttribute('aria-controls', listbox.id);
    expect(editor).toHaveAttribute('aria-activedescendant', options[0]!.id);
    expect(screen.getByRole('status')).toHaveTextContent('Título 1 selecionado, opção 1 de 7.');
  });

  it('filtra corretamente uma consulta sem acento contra rótulos acentuados (correção desta rodada: "/tit" para "Título")', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '' });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/tit');
    });

    const options = await waitFor(() => {
      const found = screen.getAllByRole('option');
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    expect(options.map((option) => option.textContent)).toEqual(['Título 1', 'Título 2', 'Título 3']);
    expect(screen.queryByText('Nenhum resultado encontrado')).not.toBeInTheDocument();
  });

  it('filtra por subsequência ordenada (mesma lógica de UXA-009) ao continuar digitando após "/"', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '' });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/numerada');
    });

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Lista numerada');
    });
  });

  it('ArrowDown/ArrowUp navegam entre as opções (aria-selected + região viva), sem mover o foco do DOM para fora do editor', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '' });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/');
    });
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}{ArrowDown}');

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options[2]).toHaveAttribute('aria-selected', 'true');
      expect(editor).toHaveAttribute('aria-activedescendant', options[2]!.id);
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Título 3 selecionado, opção 3 de 7.'));
    expect(editor).toHaveFocus();
  });

  it('Enter confirma a opção ativa: remove o texto "/query" e insere o bloco correspondente (Título 3)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/');
    });
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(await screen.findByRole('heading', { level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(editor).not.toHaveTextContent('/');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('### '));
  });

  it('clique numa opção confirma a mesma capacidade (Lista)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/lista');
    });
    const options = await waitFor(() => {
      const found = screen.getAllByRole('option');
      expect(found).toHaveLength(2);
      return found;
    });

    await user.click(options[0]!);

    const list = await screen.findByRole('list');
    expect(list.tagName).toBe('UL');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('- '));
  });

  it('confirmar "Imagem" (UXE-010) remove o texto "/imagem" e aciona o fluxo compartilhado de imagem, de forma síncrona', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/imagem');
    });
    const options = await waitFor(() => {
      const found = screen.getAllByRole('option');
      expect(found).toHaveLength(1);
      return found;
    });
    expect(options[0]).toHaveTextContent('Imagem');

    await user.click(options[0]!);

    // Síncrono: `/imagem` já não existe no documento e o menu já fechou —
    // upload/diálogo (assíncronos) são cobertos em
    // `article-body-image-flow.spec.tsx`, não aqui (mesmo racional já
    // registrado no doc comment do arquivo: este spec cobre o menu `/`
    // em si, não o fluxo de imagem inteiro).
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(editor).not.toHaveTextContent('/imagem');
    expect(screen.getByLabelText('Selecionar arquivo de imagem')).toBeInTheDocument();
  });

  it('Escape fecha o menu sem alterar o documento', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/tit');
    });
    await screen.findByRole('listbox');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(editor).toHaveTextContent('/tit');
    expect(screen.getByRole('status').textContent).toBe('');
    expect(editor).not.toHaveAttribute('aria-autocomplete');
    expect(editor).not.toHaveAttribute('aria-controls');
    expect(editor).not.toHaveAttribute('aria-activedescendant');
  });

  it('desabilitado (isSubmitting) nunca abre o menu, mesmo com "/" no documento', async () => {
    await renderEditor({ initialValue: '', disabled: true });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/');
    });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('nenhuma capacidade do menu leva a estado quebrado ao ser confirmada num editor vazio', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '' });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/');
    });
    await screen.findByRole('listbox');

    await user.keyboard('{Enter}');

    expect(editor).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('jest-axe: sem violação de acessibilidade automatizada com o menu aberto', async () => {
    const user = userEvent.setup();
    const { container } = await renderEditor({ initialValue: '' });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/');
    });
    await screen.findByRole('listbox');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('"Bloco Produto-Oferta" indisponível (sem Artigo persistido): explicação sempre visível (nunca só tooltip), aria-disabled, e nem clique nem Enter confirmam — menu permanece aberto, documento não muda além da digitação legítima de "/produto" (regressão: handlers de teclado chamavam apply() sem checar disabledReason)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/produto');
    });

    // "/produto" é uma edição real do documento (mesmo texto digitado pelo
    // usuário) — `onChange('/produto')` é uma emissão LEGÍTIMA, não uma
    // falha a esconder. Espera essa emissão explicitamente antes de
    // limpar o mock, para que as asserções seguintes (`not.toHaveBeenCalled`)
    // provem exclusivamente que TENTAR confirmar o item desabilitado não
    // altera o documento — nunca que digitar "/produto" não o alterou.
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('/produto'));
    onChange.mockClear();

    const option = await screen.findByRole('option', { name: `Bloco Produto-Oferta — ${PRODUCT_DISABLED_REASON}` });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    // A explicação é texto renderizado de verdade (Testing Library só
    // encontra por `name` acessível o que está exposto de forma real —
    // não um atributo `title` só-hover) — reforçado checando o texto no
    // próprio nó, sem depender de nenhum atributo de tooltip.
    expect(option).toHaveTextContent(PRODUCT_DISABLED_REASON);
    expect(option).not.toHaveAttribute('title');

    await user.click(option);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(editor).toHaveTextContent('/produto');
    expect(onChange).not.toHaveBeenCalled();

    // Único resultado da busca "/produto" — Enter confirma a opção ativa
    // (índice 0), que é exatamente este item desabilitado.
    await user.keyboard('{Enter}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(editor).toHaveTextContent('/produto');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('"Bloco Produto-Oferta" disponível (Artigo persistido, com Produto vinculado): sem disabledReason, confirmável por clique — remove "/produto" (alteração legítima do documento) e abre o diálogo do fluxo de Produto de forma síncrona', async () => {
    const user = userEvent.setup();
    const { onChange } = await renderEditorWithLinkedProduct();

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/produto');
    });
    // Emissão legítima da digitação de "/produto" — não escondida.
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('/produto'));

    const option = await screen.findByRole('option', { name: 'Bloco Produto-Oferta' });
    expect(option).not.toHaveAttribute('aria-disabled');

    await user.click(option);

    // Síncrono: "/produto" já não existe no documento e o menu já fechou —
    // a seleção/inserção do Produto em si (assíncrona, via diálogo) é
    // coberta em `article-body-product-flow.spec.tsx`, não aqui (mesmo
    // racional já registrado no doc comment do arquivo para "Imagem"). O
    // diálogo ter aberto é provado separadamente da mudança de documento
    // abaixo — as duas são afirmações distintas, nenhuma esconde a outra.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(editor).not.toHaveTextContent('/produto');
    expect(screen.getByRole('dialog', { name: 'Inserir bloco de Produto vinculado' })).toBeInTheDocument();

    // `blockElement.clear()` (dentro de `apply`) é, ele mesmo, uma edição
    // real do documento — o bloco volta a ficar um parágrafo vazio, e o
    // Markdown exportado diverge do estado anterior ("/produto") para "".
    // Afirmado explicitamente, nunca escondido atrás de `not.toHaveBeenCalled()`.
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(''));
  });
});
