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

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  getNearestEditorFromDOMNode,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';
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
  it('digitar "/" no início de um bloco vazio abre o menu com as 8 capacidades disponíveis, na ordem aprovada pelo PO (Bloco Produto-Oferta sempre presente — desabilitado aqui por não haver Artigo persistido, UXE-011; Citação adicionada nesta rodada, UXE-022 Addendum 7 — capacidade já existente no editor, só agora exposta no menu `/`)', async () => {
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
      expect(found).toHaveLength(8);
      return found;
    });
    expect(options.map((option) => option.textContent)).toEqual([
      'Lista',
      'Lista numerada',
      'Título 1',
      'Título 2',
      'Título 3',
      'Citação',
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
    expect(screen.getByRole('status')).toHaveTextContent('Lista selecionado, opção 1 de 8.');

    // UXE-022 (Addendum 7) — o menu passou a ser renderizado via
    // `createPortal(..., document.body)`: confirma que o popover é filho
    // direto de `document.body` (não mais aninhado dentro de `.editorCard`)
    // e que isso não quebra nenhuma busca por role/nome acessível/região
    // viva acima — todas já passaram usando só `screen`.
    const popover = listbox.parentElement;
    expect(popover?.parentElement).toBe(document.body);
    // Fallback jsdom-safe (sem mock de `Range.getBoundingClientRect`):
    // jsdom não implementa layout real, então `getCaretRect()` sempre cai
    // no caso degenerado e o popover recebe uma posição numérica segura
    // (nunca `NaN`/`undefined`) via `position: fixed`.
    expect(popover).toHaveStyle({ position: 'fixed' });
    expect(Number.isNaN(parseFloat(popover?.style.top ?? 'NaN'))).toBe(false);
    expect(Number.isNaN(parseFloat(popover?.style.left ?? 'NaN'))).toBe(false);
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

    // Nova ordem (UXE-022 Addendum 7): Lista(0), Lista numerada(1),
    // Título 1(2), Título 2(3), Título 3(4), Citação(5), Imagem(6), Bloco
    // Produto-Oferta(7). Duas setas para baixo a partir do índice 0 chegam
    // em "Título 1" (índice 2).
    await user.keyboard('{ArrowDown}{ArrowDown}');

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options[2]).toHaveAttribute('aria-selected', 'true');
      expect(editor).toHaveAttribute('aria-activedescendant', options[2]!.id);
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Título 1 selecionado, opção 3 de 8.'));
    expect(editor).toHaveFocus();

    // ArrowUp: volta um índice (2 -> 1, "Lista numerada") — a versão
    // anterior deste teste, apesar do título, nunca exercitava ArrowUp de
    // fato; adicionado agora para provar que o comando continua
    // funcionando (nenhuma mudança nesta rodada tocou o registro dos
    // comandos de teclado).
    await user.keyboard('{ArrowUp}');

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
      expect(editor).toHaveAttribute('aria-activedescendant', options[1]!.id);
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Lista numerada selecionado, opção 2 de 8.'));
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

    // Nova ordem (UXE-022 Addendum 7): "Título 3" agora é o índice 4
    // (Lista, Lista numerada, Título 1, Título 2, Título 3, ...).
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

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

  /**
   * UXE-022 (Addendum 7) — testes novos desta rodada: "Citação" (capacidade
   * já existente no editor via `article-body-toolbar.tsx`, agora também
   * exposta pelo menu `/`), fechar ao clicar fora, ancoragem ao caret
   * (mock de `Range.getBoundingClientRect`) e collision handling
   * (clamp/flip) num limite de viewport.
   */

  it('confirmar "Citação" remove o texto "/cit" e insere um bloco de citação (mesma $createQuoteNode() já usada pela toolbar)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/cit');
    });
    const options = await waitFor(() => {
      const found = screen.getAllByRole('option');
      expect(found).toHaveLength(1);
      return found;
    });
    expect(options[0]).toHaveTextContent('Citação');

    await user.click(options[0]!);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(editor).not.toHaveTextContent('/cit');
    // Transformer Markdown QUOTE (já usado pelo editor/toolbar, ver
    // TRANSFORMERS em `article-body-editor.tsx`) serializa blockquote como
    // prefixo "> " — mesmo padrão já comprovado pelo teste de "Lista"
    // acima ("- ").
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('> '));
  });

  it('clicar fora do popover e do editor fecha o menu sem alterar o documento (mesmo padrão de limpeza do Escape)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });
    render(
      <button type="button" onClick={() => {}}>
        Fora do editor
      </button>,
    );

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/tit');
    });
    await screen.findByRole('listbox');

    await user.click(screen.getByRole('button', { name: 'Fora do editor' }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(editor).toHaveTextContent('/tit');
    expect(screen.getByRole('status').textContent).toBe('');
    expect(editor).not.toHaveAttribute('aria-autocomplete');
    expect(editor).not.toHaveAttribute('aria-controls');
    expect(editor).not.toHaveAttribute('aria-activedescendant');
    expect(onChange).not.toHaveBeenCalledWith('');
  });

  it('clicar dentro do próprio popover (fora de uma opção) não fecha o menu', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '' });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/');
    });
    const listbox = await screen.findByRole('listbox');
    const popover = listbox.parentElement as HTMLElement;

    await user.click(popover);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('ancora o popover ao caret via Range.getBoundingClientRect (mock) — posição = borda inferior do caret + gap', async () => {
    const user = userEvent.setup();
    const caretRect = {
      top: 100,
      left: 50,
      bottom: 120,
      right: 150,
      width: 100,
      height: 20,
      x: 50,
      y: 100,
      toJSON() {
        return this;
      },
    } as DOMRect;
    const rectSpy = jest.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(caretRect);
    try {
      await renderEditor({ initialValue: '' });
      const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
      await user.click(editor);
      act(() => {
        insertTextIntoEmptyLexicalEditor(editor, '/');
      });
      const listbox = await screen.findByRole('listbox');
      const popover = listbox.parentElement as HTMLElement;

      // menuWidth/menuHeight são 0 em jsdom (sem layout real) — o cálculo
      // usa só a âncora do caret nesse caso: top = caretRect.bottom + GAP
      // (4px), left = caretRect.left (sem colisão nesse retângulo).
      expect(popover).toHaveStyle({ position: 'fixed', top: '124px', left: '50px' });
    } finally {
      rectSpy.mockRestore();
    }
  });

  it('collision handling: clamp horizontal perto da borda direita e flip vertical perto da borda inferior da viewport', async () => {
    const user = userEvent.setup();
    // jsdom: window.innerWidth/innerHeight padrão são 1024x768.
    const caretRect = {
      top: 740,
      left: 1020,
      bottom: 765,
      right: 1120,
      width: 100,
      height: 25,
      x: 1020,
      y: 740,
      toJSON() {
        return this;
      },
    } as DOMRect;
    const rectSpy = jest.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(caretRect);
    try {
      await renderEditor({ initialValue: '' });
      const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
      await user.click(editor);
      act(() => {
        insertTextIntoEmptyLexicalEditor(editor, '/');
      });
      const listbox = await screen.findByRole('listbox');
      const popover = listbox.parentElement as HTMLElement;

      // Clamp horizontal: left (1020) + menuWidth (0) > 1024 - 8 (margem)
      // → reancora a 8px da borda direita: 1024 - 0 - 8 = 1016.
      // Flip vertical: top (765 + 4 de gap = 769) + menuHeight (0) > 768 - 8
      // (sem espaço abaixo) → abre acima do caret: 740 - 0 - 4 = 736 (ainda
      // dentro da margem mínima de 8px do topo).
      expect(popover).toHaveStyle({ position: 'fixed', top: '736px', left: '1016px' });
    } finally {
      rectSpy.mockRestore();
    }
  });
});

/**
 * Caminho B do gatilho `/` — `/query` logo após um `LineBreakNode` dentro de
 * um `ParagraphNode` (Shift+Enter, ou paste de HTML terminando em `<br>`).
 * Bug reproduzido: depois de colar conteúdo, o caret ficava numa "linha
 * vazia" visual que é, na verdade, uma quebra dentro do MESMO parágrafo — o
 * texto do bloco (`"Linha 1\n/"`) nunca casava com o caminho A.
 *
 * Estados positivos usam os comandos reais do Lexical (`KEY_ENTER_COMMAND`
 * com `shiftKey`, `PASTE_COMMAND` tratado pelo `RichTextPlugin`,
 * `UNDO_COMMAND` do `HistoryPlugin`). Estados negativos que exigiriam
 * digitar DEPOIS de o menu já estar aberto são montados diretamente pela
 * API pública do Lexical — com o menu aberto, Enter/Shift+Enter é consumido
 * pelo próprio menu (comportamento pré-existente, fora deste escopo).
 */
describe('ArticleBodySlashMenu — "/" após quebra de linha num parágrafo (caminho B)', () => {
  // jsdom não implementa `DragEvent` nem `ClipboardEvent`; o handler de
  // paste do `RichTextPlugin` (`eventFiles`, @lexical/utils) referencia as
  // duas classes para distinguir drop de paste. Shims mínimos, só durante
  // este bloco, removidos ao final — nenhum efeito sobre os demais testes.
  type EventGlobals = { DragEvent?: unknown; ClipboardEvent?: unknown };
  const shimmed: Array<keyof EventGlobals> = [];
  beforeAll(() => {
    const globals = globalThis as EventGlobals;
    if (typeof globals.DragEvent === 'undefined') {
      globals.DragEvent = class DragEvent extends Event {};
      shimmed.push('DragEvent');
    }
    if (typeof globals.ClipboardEvent === 'undefined') {
      globals.ClipboardEvent = class ClipboardEvent extends Event {
        readonly clipboardData: unknown;
        constructor(type: string, init: { clipboardData?: unknown } = {}) {
          super(type);
          this.clipboardData = init.clipboardData ?? null;
        }
      };
      shimmed.push('ClipboardEvent');
    }
  });
  afterAll(() => {
    for (const name of shimmed) {
      delete (globalThis as EventGlobals)[name];
    }
  });

  function getEditor(editorRoot: HTMLElement): LexicalEditor {
    const editor = getNearestEditorFromDOMNode(editorRoot);
    if (!editor) {
      throw new Error('nenhuma instância de LexicalEditor encontrada a partir do DOM.');
    }
    return editor;
  }

  function describeNode(node: LexicalNode): string {
    if ($isTextNode(node)) {
      return JSON.stringify(node.getTextContent());
    }
    if ($isElementNode(node)) {
      const tag = 'getTag' in node && typeof node.getTag === 'function' ? `:${String(node.getTag())}` : '';
      return `${node.getType()}${tag}[${node.getChildren().map(describeNode).join(',')}]`;
    }
    return node.getType();
  }

  function readBlocks(editorRoot: HTMLElement): string {
    return getEditor(editorRoot)
      .getEditorState()
      .read(() => $getRoot().getChildren().map(describeNode).join(' | '));
  }

  function typeAtSelection(editorRoot: HTMLElement, text: string): void {
    getEditor(editorRoot).update(
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(text);
        }
      },
      { discrete: true },
    );
  }

  function pressShiftEnter(editorRoot: HTMLElement): void {
    const editor = getEditor(editorRoot);
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    editor.update(() => {}, { discrete: true });
  }

  function pasteClipboard(editorRoot: HTMLElement, data: Record<string, string>): void {
    const editor = getEditor(editorRoot);
    const clipboardData = { types: Object.keys(data), getData: (type: string) => data[type] ?? '', files: [], items: [] };
    const event = new ClipboardEvent('paste', { clipboardData: clipboardData as unknown as DataTransfer });
    editor.dispatchCommand(PASTE_COMMAND, event);
    editor.update(() => {}, { discrete: true });
  }

  /** "Texto" ⇧⏎ `slashText`, com comandos reais. */
  async function typeTextShiftEnterSlash(editorRoot: HTMLElement, slashText: string) {
    act(() => {
      insertTextIntoEmptyLexicalEditor(editorRoot, 'Texto');
    });
    act(() => {
      pressShiftEnter(editorRoot);
    });
    act(() => {
      typeAtSelection(editorRoot, slashText);
    });
  }

  /** Monta um único parágrafo com os filhos dados e põe o caret em (índice do filho, offset). */
  function setParagraph(editorRoot: HTMLElement, parts: Array<string | 'LB'>, caret: { child: number; offset: number }) {
    getEditor(editorRoot).update(
      () => {
        const paragraph = $createParagraphNode();
        for (const part of parts) {
          paragraph.append(part === 'LB' ? $createLineBreakNode() : $createTextNode(part));
        }
        $getRoot().clear().append(paragraph);
        const target = paragraph.getChildren()[caret.child];
        if (!$isTextNode(target)) {
          throw new Error('caret precisa estar num TextNode');
        }
        target.select(caret.offset, caret.offset);
      },
      { discrete: true },
    );
  }

  it('paste de HTML terminando em <br> + "/" na linha visual vazia abre o menu; confirmar "Título 2" preserva o conteúdo colado', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });
    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);

    act(() => {
      pasteClipboard(editor, { 'text/html': '<span>Linha 1</span><br>', 'text/plain': 'Linha 1\n' });
    });
    // Evidência do cenário real: a "linha vazia" é uma quebra dentro do MESMO parágrafo.
    expect(readBlocks(editor)).toBe('paragraph["Linha 1",linebreak]');

    act(() => {
      typeAtSelection(editor, '/');
    });
    await screen.findByRole('listbox');

    // Lista, Lista numerada, Título 1, Título 2.
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

    expect(await screen.findByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(readBlocks(editor)).toBe('paragraph["Linha 1"] | heading:h2[]');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('Linha 1\n\n## '));
  });

  it('Shift+Enter + "/" num parágrafo abre o menu (com a query depois da quebra)', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '' });
    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);

    await typeTextShiftEnterSlash(editor, '/lista');

    expect(readBlocks(editor)).toBe('paragraph["Texto",linebreak,"/lista"]');
    const options = await waitFor(() => {
      const found = screen.getAllByRole('option');
      expect(found).toHaveLength(2);
      return found;
    });
    expect(options[0]).toHaveTextContent('Lista');
  });

  it('Escape fecha o menu do caminho B sem alterar o documento', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });
    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    await typeTextShiftEnterSlash(editor, '/tit');
    await screen.findByRole('listbox');
    const before = readBlocks(editor);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(readBlocks(editor)).toBe(before);
    expect(readBlocks(editor)).toBe('paragraph["Texto",linebreak,"/tit"]');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('Texto\n/tit'));
  });

  it('Undo depois de confirmar restaura integralmente a estrutura anterior (parágrafo, quebra e "/")', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '' });
    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    await typeTextShiftEnterSlash(editor, '/');
    await screen.findByRole('listbox');
    const before = readBlocks(editor);
    expect(before).toBe('paragraph["Texto",linebreak,"/"]');

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(readBlocks(editor)).toBe('paragraph["Texto"] | heading:h2[]');

    act(() => {
      getEditor(editor).dispatchCommand(UNDO_COMMAND, undefined);
    });

    await waitFor(() => expect(readBlocks(editor)).toBe(before));
  });

  it('parágrafo que começa pela quebra ([quebra, "/x"]): reaproveita o próprio parágrafo, sem deixar parágrafo vazio sobrando', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });
    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      setParagraph(editor, ['LB', '/'], { child: 1, offset: 1 });
    });
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

    expect(readBlocks(editor)).toBe('heading:h2[]');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('## '));
  });

  it('remove só a quebra imediatamente anterior a "/query" — quebras anteriores do usuário são preservadas', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '' });
    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      setParagraph(editor, ['Texto', 'LB', 'LB', '/'], { child: 3, offset: 1 });
    });
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

    expect(readBlocks(editor)).toBe('paragraph["Texto",linebreak] | heading:h2[]');
  });

  it.each([
    ['"texto /x" (barra no meio da frase)', ['Texto', 'LB', 'texto /x'] as Array<string | 'LB'>, { child: 2, offset: 8 }],
    ['"1/2"', ['Texto', 'LB', '1/2'] as Array<string | 'LB'>, { child: 2, offset: 3 }],
    ['"/x" numa linha intermediária, com conteúdo depois no mesmo parágrafo', ['A', 'LB', '/x', 'LB', 'B'] as Array<string | 'LB'>, { child: 2, offset: 2 }],
    ['cursor no meio de "/tit"', ['Texto', 'LB', '/tit'] as Array<string | 'LB'>, { child: 2, offset: 2 }],
  ])('não abre: %s', async (_label, parts, caret) => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '' });
    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      setParagraph(editor, parts, caret);
    });
    const before = readBlocks(editor);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(readBlocks(editor)).toBe(before);
  });

  it.each([
    ['Heading', '## Texto', 'heading:h2["Texto",linebreak,"/tit"]'],
    ['Quote', '> Texto', 'quote["Texto",linebreak,"/tit"]'],
  ])('%s com Shift+Enter + "/tit" não entra no caminho B: menu não abre e a estrutura não muda', async (_label, initialValue, expected) => {
    const user = userEvent.setup();
    await renderEditor({ initialValue });
    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      getEditor(editor).update(() => $getRoot().getFirstChildOrThrow().selectEnd(), { discrete: true });
    });
    act(() => {
      pressShiftEnter(editor);
    });
    act(() => {
      typeAtSelection(editor, '/tit');
    });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(readBlocks(editor)).toBe(expected);
  });

  it('Lista com Shift+Enter + "/tit" num item: menu não abre, a lista não é dividida e nenhum parágrafo aparece entre os itens', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '- Item A\n- Item B' });
    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      getEditor(editor).update(
        () => {
          const list = $getRoot().getFirstChildOrThrow();
          if (!$isElementNode(list)) {
            throw new Error('esperado ListNode');
          }
          list.getFirstChildOrThrow().selectEnd();
        },
        { discrete: true },
      );
    });
    act(() => {
      pressShiftEnter(editor);
    });
    act(() => {
      typeAtSelection(editor, '/tit');
    });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(readBlocks(editor)).toBe('list:ul[listitem["Item A",linebreak,"/tit"],listitem["Item B"]]');
  });

  it('"Imagem" no caminho B: o fluxo recebe o blockKey de um parágrafo vazio novo, após o conteúdo preservado — a imagem o substitui', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>(async (input) => {
      if (String(input).includes('/uploads/images')) {
        return { ok: true, status: 201, text: () => Promise.resolve(JSON.stringify({ url: 'https://cdn.exemplo.com/b.png' })) } as Response;
      }
      return { ok: false, status: 404, text: () => Promise.resolve('{}') } as Response;
    });
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });
    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    await typeTextShiftEnterSlash(editor, '/imagem');
    const options = await screen.findAllByRole('option');
    await user.click(options[options.length - 1]!);

    // Síncrono: "/imagem" e a quebra saíram; o alvo é um parágrafo vazio logo após "Texto".
    expect(readBlocks(editor)).toBe('paragraph["Texto"] | paragraph[]');

    await user.upload(screen.getByLabelText('Selecionar arquivo de imagem'), new File(['x'], 'b.png', { type: 'image/png' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('radio', { name: /Decorativa/ }));
    await user.click(screen.getByRole('button', { name: 'Inserir imagem' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('Texto\n\n![](<https://cdn.exemplo.com/b.png>)\n'));
  });

  it('"Bloco Produto-Oferta" no caminho B: o fluxo recebe o blockKey de um parágrafo vazio novo, após o conteúdo preservado — o bloco o substitui', async () => {
    const user = userEvent.setup();
    const { onChange, productId } = await renderEditorWithLinkedProduct();
    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    await typeTextShiftEnterSlash(editor, '/produto');
    const option = await screen.findByRole('option', { name: 'Bloco Produto-Oferta' });
    await user.click(option);

    expect(readBlocks(editor)).toBe('paragraph["Texto"] | paragraph[]');

    await user.selectOptions(await screen.findByLabelText('Produto vinculado'), productId);
    await user.click(screen.getByRole('button', { name: 'Inserir bloco' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining(`Texto\n\n:::product\nversion: 1\nproductId: ${productId}\n:::`)));
  });
});
