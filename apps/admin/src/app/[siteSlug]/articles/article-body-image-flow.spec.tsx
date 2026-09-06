/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image-flow.spec.tsx
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade.
 *
 * Testa `ArticleBodyImageFlow` sempre através de `ArticleBodyEditor`
 * completo (mesmo racional já usado por `article-body-toolbar.spec.tsx`/
 * `article-body-slash-menu.spec.tsx`) — cobre o fluxo assíncrono completo
 * (upload real via `global.fetch` mockado, decisão informativa/
 * decorativa, inserção/round-trip, falha, cancelamento). A cobertura
 * síncrona do próprio menu `/` (item "Imagem" remove `/query` e aciona o
 * fluxo) já está em `article-body-slash-menu.spec.tsx` — não repetida
 * aqui em detalhe, só reexercitada como caminho de entrada de um dos
 * cenários abaixo.
 *
 * Mesma técnica de inserção de texto de `article-body-slash-menu.spec.tsx`
 * (`insertTextIntoEmptyLexicalEditor`, via API pública do Lexical —
 * `user.type()` num `contentEditable` estruturalmente vazio não é
 * confiável no jsdom). Mock de `global.fetch` no mesmo padrão já usado em
 * `article-form.spec.tsx` (`jsonResponse`/roteamento por URL) — não
 * `jest.mock('.../api-client')`, para exercitar `apiRequest` real.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
 * Diferente de `insertTextIntoEmptyLexicalEditor` (que sempre força a
 * seleção para o INÍCIO do documento via `selectStart()`): insere no que
 * quer que seja a seleção ATUAL, sem tocá-la antes. É o que um teste de
 * regressão de "o caret continua utilizável depois de X" precisa —
 * `user.keyboard()` num `contentEditable` não é confiável no jsdom (ver
 * comentário do arquivo), então a mesma técnica de API pública do Lexical
 * já usada acima é reaproveitada aqui, só sem reposicionar a seleção.
 */
function insertTextAtCurrentSelection(editorRoot: HTMLElement, text: string): void {
  const editor = getNearestEditorFromDOMNode(editorRoot);
  if (!editor) {
    throw new Error('insertTextAtCurrentSelection: nenhuma instância de LexicalEditor encontrada a partir do DOM.');
  }
  editor.update(
    () => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertText(text);
      }
    },
    { discrete: true },
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function mockUploadFetch(options: { upload?: () => Response } = {}) {
  global.fetch = jest.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.includes('/uploads/images')) {
      return options.upload ? options.upload() : jsonResponse(201, { url: 'https://cdn.exemplo.com/uploaded.jpg' });
    }
    throw new Error(`unexpected fetch: ${url} (${init?.method ?? 'GET'})`);
  });
}

function makeFile(name = 'foto.jpg'): File {
  return new File(['fake-image-bytes'], name, { type: 'image/jpeg' });
}

describe('ArticleBodyImageFlow', () => {
  it('toolbar: informativa com sucesso — imagem inserida como bloco após o bloco de ancoragem, com o alt digitado', async () => {
    const user = userEvent.setup();
    mockUploadFetch();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, 'Texto existente');
    });

    const imageButton = await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Imagem' });
      expect(button).toBeEnabled();
      return button;
    });
    await user.click(imageButton);

    expect(imageButton).toBeDisabled();

    const fileInput = screen.getByLabelText('Selecionar arquivo de imagem');
    await user.upload(fileInput, makeFile());

    await screen.findByRole('dialog', { name: 'Inserir imagem' });
    await user.type(screen.getByLabelText('Texto alternativo'), 'Minha descrição');
    await user.click(screen.getByRole('button', { name: 'Inserir imagem' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByAltText('Minha descrição')).toBeInTheDocument();
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('![Minha descrição](<https://cdn.exemplo.com/uploaded.jpg>)')),
    );
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('Texto existente'));
    expect(imageButton).toBeEnabled();
    expect(editor).toHaveFocus();
  });

  it('toolbar: imagem inserida como último bloco do documento — cria um parágrafo vazio para o caret continuar editável depois dela (regressão)', async () => {
    // Bug real encontrado em validação manual: quando a imagem inserida
    // pela toolbar vira o ÚLTIMO bloco de nível superior do documento (sem
    // nenhum bloco já existente depois dela), `imageNode.selectNext()`
    // (Lexical core) caía no seu próprio fallback para "sem próximo
    // irmão" — selecionar o RootNode — o que não é um caret de texto
    // utilizável: dava para inserir a imagem, mas não para continuar
    // digitando depois dela. Corrigido em `article-body-image-flow.tsx`
    // criando um parágrafo vazio mínimo nesse caso específico (nunca
    // quando já existe um bloco depois da imagem — ver o outro teste
    // acima, que insere a imagem no meio e não precisa de nenhum
    // parágrafo extra).
    const user = userEvent.setup();
    mockUploadFetch();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, 'Texto existente');
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Texto existente'));
    onChange.mockClear();

    const imageButton = await screen.findByRole('button', { name: 'Imagem' });
    await user.click(imageButton);
    await user.upload(screen.getByLabelText('Selecionar arquivo de imagem'), makeFile());
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText('Texto alternativo'), 'Imagem no fim');
    await user.click(screen.getByRole('button', { name: 'Inserir imagem' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await screen.findByAltText('Imagem no fim');

    // O caret precisa estar num bloco de texto real, pronto para receber
    // digitação, não numa seleção "no RootNode" — inserir na seleção
    // ATUAL (sem repositioná-la) é o que efetivamente comprova isso.
    act(() => {
      insertTextAtCurrentSelection(editor, 'Depois da imagem');
    });

    const finalMarkdown = await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string;
      expect(lastCall).toContain('Depois da imagem');
      return lastCall;
    });

    // Ordem preservada: texto original, depois a imagem, depois o texto
    // novo — no parágrafo criado pela correção, não num parágrafo extra
    // sobrando (nenhuma linha em branco redundante entre a imagem e o
    // texto novo).
    expect(finalMarkdown).toBe(
      'Texto existente\n\n![Imagem no fim](<https://cdn.exemplo.com/uploaded.jpg>)\n\nDepois da imagem',
    );
  });

  it('menu "/": decorativa com sucesso — imagem substitui exatamente o bloco vazio do comando', async () => {
    const user = userEvent.setup();
    mockUploadFetch({ upload: () => jsonResponse(201, { url: 'https://cdn.exemplo.com/decorativa.png' }) });
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/imagem');
    });
    const options = await screen.findAllByRole('option');
    await user.click(options[options.length - 1]!);

    expect(editor).not.toHaveTextContent('/imagem');

    await user.upload(screen.getByLabelText('Selecionar arquivo de imagem'), makeFile('logo.png'));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('radio', { name: /Decorativa/ }));
    await user.click(screen.getByRole('button', { name: 'Inserir imagem' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Neste cenário o comando `/imagem` substitui (`replace-empty`) o único
    // bloco de nível superior do documento vazio, então a imagem também vira
    // o último bloco — a mesma regra estrutural do teste de regressão acima
    // cria um parágrafo vazio após ela para o caret continuar editável.
    // `isEmptyParagraph`/`createMarkdownExport` (@lexical/markdown) exportam
    // esse parágrafo vazio como string vazia, unida por um único `\n` de
    // junção — daí o `\n` final abaixo, que é conteúdo estrutural, não
    // textual espúrio. Valor exato afirmado (sem `.trim()`/normalização) para
    // não esconder nenhum conteúdo extra além desse `\n` esperado.
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith('![](<https://cdn.exemplo.com/decorativa.png>)\n'),
    );
    const img = editor.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('alt', '');
  });

  it('informativa sem alt-text: confirmar mostra erro de validação e não faz upload', async () => {
    const user = userEvent.setup();
    mockUploadFetch();
    await renderEditor({ initialValue: '' });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, 'Texto existente');
    });
    await user.click(await screen.findByRole('button', { name: 'Imagem' }));
    await user.upload(screen.getByLabelText('Selecionar arquivo de imagem'), makeFile());
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Inserir imagem' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um texto alternativo');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('falha de upload: exibe erro, nada é inserido, editor volta a ficar editável', async () => {
    const user = userEvent.setup();
    mockUploadFetch({ upload: () => jsonResponse(500, { message: 'erro interno' }) });
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, 'Texto existente');
    });

    // Chamada legítima da própria preparação do cenário (edição real de
    // "Texto existente", não o fluxo de imagem) — afirmada explicitamente
    // e depois limpa do mock, para que a asserção `not.toHaveBeenCalled()`
    // abaixo prove exatamente o que o fluxo de imagem faz (nada), não o
    // que a preparação do teste já fez antes dele começar.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Texto existente'));
    onChange.mockClear();

    const imageButton = await screen.findByRole('button', { name: 'Imagem' });
    await user.click(imageButton);
    await user.upload(screen.getByLabelText('Selecionar arquivo de imagem'), makeFile());
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('radio', { name: /Decorativa/ }));
    await user.click(screen.getByRole('button', { name: 'Inserir imagem' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível enviar a imagem');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(imageButton).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('toolbar: cancelar antes de confirmar não faz upload, não insere nada e reabilita o editor', async () => {
    const user = userEvent.setup();
    mockUploadFetch();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, 'Texto existente');
    });

    // Chamada legítima da própria preparação do cenário (edição real de
    // "Texto existente", não o fluxo de imagem) — afirmada explicitamente
    // e depois limpa do mock, para que a asserção `not.toHaveBeenCalled()`
    // abaixo prove exatamente o que o cancelamento faz (nenhuma alteração
    // de conteúdo), não o que a preparação do teste já fez antes dele
    // começar.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Texto existente'));
    onChange.mockClear();

    const imageButton = await screen.findByRole('button', { name: 'Imagem' });
    await user.click(imageButton);
    await user.upload(screen.getByLabelText('Selecionar arquivo de imagem'), makeFile());
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(imageButton).toBeEnabled());
    expect(editor).toHaveTextContent('Texto existente');
    expect(editor).toHaveFocus();
  });

  it('menu "/": cancelar retorna o caret para o bloco vazio, sem tentar restaurar o texto "/imagem" removido', async () => {
    const user = userEvent.setup();
    mockUploadFetch();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, '/imagem');
    });
    const options = await screen.findAllByRole('option');
    await user.click(options[options.length - 1]!);
    await user.upload(screen.getByLabelText('Selecionar arquivo de imagem'), makeFile());
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(editor).not.toHaveTextContent('/imagem');
    expect(editor).toHaveFocus();

    // Digitar depois do cancelamento deve continuar dentro do mesmo
    // (único) bloco vazio, não criar um segundo bloco/parágrafo solto —
    // comprovado indiretamente por não haver nenhum `<img>` e o
    // documento seguir com um único parágrafo editável.
    act(() => {
      insertTextIntoEmptyLexicalEditor(editor, 'depois de cancelar');
    });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('depois de cancelar'));
  });
});
