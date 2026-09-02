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
          initialValue={props.initialValue ?? ''}
          onChange={onChange}
          disabled={props.disabled}
        />
      </>,
    );
  });
  return { ...utils, onChange };
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
  it('digitar "/" no início de um bloco vazio abre o menu com as 5 capacidades já disponíveis (imagem e bloco Produto-Oferta ausentes)', async () => {
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
      expect(found).toHaveLength(5);
      return found;
    });
    expect(options.map((option) => option.textContent)).toEqual([
      'Título 1',
      'Título 2',
      'Título 3',
      'Lista',
      'Lista numerada',
    ]);
    expect(screen.queryByText('Imagem')).not.toBeInTheDocument();
    expect(screen.queryByText(/Produto/)).not.toBeInTheDocument();
    // Vínculo de combobox: `aria-autocomplete`/`aria-controls`/
    // `aria-activedescendant` SÃO permitidos em `role="textbox"` (ARIA
    // 1.2) — só `aria-expanded`/`aria-haspopup` não são (comprovado por
    // Axe). Ver doc comment de `article-body-slash-menu.tsx`.
    expect(editor).not.toHaveAttribute('aria-expanded');
    expect(editor).not.toHaveAttribute('aria-haspopup');
    expect(editor).toHaveAttribute('aria-autocomplete', 'list');
    expect(editor).toHaveAttribute('aria-controls', listbox.id);
    expect(editor).toHaveAttribute('aria-activedescendant', options[0]!.id);
    expect(screen.getByRole('status')).toHaveTextContent('Título 1 selecionado, opção 1 de 5.');
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
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Título 3 selecionado, opção 3 de 5.'));
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
});
