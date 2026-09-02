/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-toolbar.spec.tsx
 *
 * UXE-007 — Toolbar e menu de comando `/`.
 *
 * Testa `ArticleBodyToolbar` sempre através de `ArticleBodyEditor` completo
 * (não isolado) — `ArticleBodyToolbar` depende de `useLexicalComposerContext`,
 * então só existe dentro da árvore real do editor; isso também serve como
 * regressão de integração confirmando que a UXE-006 continua funcionando
 * com os plugins novos desta tarefa montados ao lado.
 *
 * Helpers de seleção duplicados deliberadamente de
 * `article-body-editor.spec.tsx` (não extraídos para um módulo
 * compartilhado nesta tarefa, para não tocar num arquivo de teste já
 * aprovado/passando da UXE-006 sem necessidade real) — mesmo racional já
 * documentado lá: `{End}`/`{Home}`/seleção de texto via `user-event` não
 * são confiáveis num `contentEditable` estruturado pelo Lexical
 * (`@testing-library/user-event@14.6.3` lança "Not implemented" fora de
 * `<input>`/`<textarea>`/contentEditable de nó de texto único); a seleção
 * nativa via `Range`/`Selection` do jsdom não depende de layout e já é a
 * mesma técnica usada e comprovada nesta base de código.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
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

function collapseSelectionAfterText(root: HTMLElement, targetText: string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    if (textNode.textContent === targetText) {
      const range = document.createRange();
      range.setStart(textNode, textNode.length);
      range.collapse(true);
      const domSelection = window.getSelection();
      domSelection?.removeAllRanges();
      domSelection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    node = walker.nextNode();
  }
  throw new Error(`collapseSelectionAfterText: nenhum nó de texto igual a ${JSON.stringify(targetText)} encontrado.`);
}

function selectWholeTextNode(root: HTMLElement, targetText: string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    if (textNode.textContent === targetText) {
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, textNode.length);
      const domSelection = window.getSelection();
      domSelection?.removeAllRanges();
      domSelection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    node = walker.nextNode();
  }
  throw new Error(`selectWholeTextNode: nenhum nó de texto igual a ${JSON.stringify(targetText)} encontrado.`);
}

describe('ArticleBodyToolbar', () => {
  it('renderiza com role="toolbar", nome acessível e um botão por formatação do editor base', async () => {
    await renderEditor();

    expect(screen.getByRole('toolbar', { name: 'Formatação do corpo do Artigo' })).toBeInTheDocument();
    for (const name of ['Negrito', 'Itálico', 'Título 1', 'Título 2', 'Título 3', 'Citação', 'Lista', 'Lista numerada', 'Link']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('desabilitada (isSubmitting) reflete em todos os botões da toolbar', async () => {
    await renderEditor({ disabled: true });

    for (const name of ['Negrito', 'Itálico', 'Título 1', 'Citação', 'Lista', 'Lista numerada']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('Negrito: aplica ênfase à seleção e exporta **texto** no Markdown', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: 'palavra', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    act(() => {
      selectWholeTextNode(editor, 'palavra');
    });
    await user.click(screen.getByRole('button', { name: 'Negrito' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('**palavra**'));
    expect(screen.getByRole('button', { name: 'Negrito' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Itálico: aplica ênfase à seleção e exporta *texto* no Markdown', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: 'palavra', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    act(() => {
      selectWholeTextNode(editor, 'palavra');
    });
    await user.click(screen.getByRole('button', { name: 'Itálico' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('*palavra*'));
  });

  it('Título 1: converte o parágrafo em H1 e alterna de volta a parágrafo ao clicar novamente', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: 'Parágrafo simples', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    act(() => {
      collapseSelectionAfterText(editor, 'Parágrafo simples');
    });

    const headingButton = screen.getByRole('button', { name: 'Título 1' });
    await user.click(headingButton);

    expect(await screen.findByRole('heading', { level: 1, name: 'Parágrafo simples' })).toBeInTheDocument();
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('# Parágrafo simples'));
    expect(headingButton).toHaveAttribute('aria-pressed', 'true');

    await user.click(headingButton);

    await waitFor(() => expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument());
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('Parágrafo simples'));
  });

  it('Lista: converte o parágrafo em lista não ordenada e alterna de volta ao clicar novamente', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: 'Item único', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    act(() => {
      collapseSelectionAfterText(editor, 'Item único');
    });

    const listButton = screen.getByRole('button', { name: 'Lista' });
    await user.click(listButton);

    const list = await screen.findByRole('list');
    expect(list.tagName).toBe('UL');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('- Item único'));

    await user.click(listButton);

    await waitFor(() => expect(screen.queryByRole('list')).not.toBeInTheDocument());
  });

  it('Link: desabilitado sem seleção de texto; habilitado com seleção, cria o link via mini-formulário inline (sem window.prompt) e exporta [texto](url)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: 'FastCompre', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    act(() => {
      collapseSelectionAfterText(editor, 'FastCompre');
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled());

    act(() => {
      selectWholeTextNode(editor, 'FastCompre');
    });
    const linkButton = screen.getByRole('button', { name: 'Link' });
    await waitFor(() => expect(linkButton).not.toBeDisabled());

    await user.click(linkButton);

    const urlInput = await screen.findByLabelText('URL do link');
    await user.type(urlInput, 'https://fastcompre.com.br');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('link', { name: 'FastCompre' })).toHaveAttribute('href', 'https://fastcompre.com.br');
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('[FastCompre](https://fastcompre.com.br)'));
  });

  it('Link: "Cancelar" fecha o mini-formulário sem alterar o documento', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: 'FastCompre', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    act(() => {
      selectWholeTextNode(editor, 'FastCompre');
    });
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await user.type(await screen.findByLabelText('URL do link'), 'https://exemplo.com');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('URL do link')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Link: sobre um link existente, o botão vira "Editar link" e "Remover link" desfaz o link preservando o texto', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '[FastCompre](https://fastcompre.com.br)', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    act(() => {
      collapseSelectionAfterText(editor, 'FastCompre');
    });

    const editLinkButton = await screen.findByRole('button', { name: 'Editar link' });
    await user.click(editLinkButton);

    expect(await screen.findByLabelText('URL do link')).toHaveValue('https://fastcompre.com.br');
    await user.click(screen.getByRole('button', { name: 'Remover link' }));

    await waitFor(() => expect(screen.queryByRole('link')).not.toBeInTheDocument());
    expect(screen.getByText('FastCompre')).toBeInTheDocument();
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('FastCompre'));
  });

  it('nenhum botão leva a estado quebrado ao ser acionado num editor vazio', async () => {
    const user = userEvent.setup();
    await renderEditor({ initialValue: '' });

    await user.click(screen.getByRole('button', { name: 'Título 1' }));
    await user.click(screen.getByRole('button', { name: 'Lista' }));
    await user.click(screen.getByRole('button', { name: 'Lista numerada' }));
    await user.click(screen.getByRole('button', { name: 'Citação' }));

    expect(screen.getByRole('textbox', { name: 'Corpo (Markdown)' })).toBeInTheDocument();
  });

  it('jest-axe: sem violação de acessibilidade automatizada com a toolbar visível', async () => {
    const { container } = await renderEditor({ initialValue: 'Texto simples.' });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('jest-axe: sem violação com o mini-formulário de link aberto', async () => {
    const user = userEvent.setup();
    const { container } = await renderEditor({ initialValue: 'FastCompre' });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    act(() => {
      selectWholeTextNode(editor, 'FastCompre');
    });
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await screen.findByLabelText('URL do link');

    expect(await axe(container)).toHaveNoViolations();
  });
});
