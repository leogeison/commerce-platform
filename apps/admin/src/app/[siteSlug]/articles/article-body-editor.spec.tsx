/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-editor.spec.tsx
 *
 * UXE-006 — Integração base do Lexical no Admin.
 *
 * Escopo de teste combinado, conforme esclarecido pelo usuário:
 *   - heading/lista/link: testados principalmente como
 *     importação → edição → exportação preservando a estrutura, NUNCA
 *     criação-do-zero via atalho de teclado (isso é UXE-007 — nenhum
 *     `MarkdownShortcutPlugin`/infraestrutura de criação foi adicionado
 *     nesta tarefa).
 *   - regressão "carregar sem editar": usa um dos 3 `bodyMdx` reais
 *     congelados em `spikes/lexical-editorial/corpus/persisted-current/`
 *     (evidência UXE-002) — deve permanecer byte-idêntico, o que aqui é
 *     comprovado por `onChange` NUNCA ser chamado (o valor no formulário
 *     nunca é sobrescrito só por abrir o Artigo).
 *   - fail-closed do bloco `:::product` malformado já é comprovado no
 *     editor real (DOM real, não headless) em `product-block.spec.ts`,
 *     via `createEditor` diretamente — não repetido aqui através da árvore
 *     React completa, para não duplicar cobertura com mais fragilidade.
 *
 * Infraestrutura de teste (ajuste mecânico, sem mudança de comportamento
 * de produção): `renderEditor` envolve `render(...)` em `act(async () =>
 * ...)`. O Lexical agenda parte do trabalho da montagem inicial (ex.: o
 * hook interno de visibilidade de placeholder do `RichTextPlugin`) via
 * microtask, fora do `act` síncrono que `render()` do Testing Library já
 * aplica — sem esperar essa microtask, testes que não fazem nenhum
 * `await`/`waitFor` logo após montar (ex.: os que só verificam
 * atributos/import estático) recebem o aviso "not wrapped in act(...)".
 * Isso não muda nenhuma asserção nem contorna nenhum comportamento real:
 * só dá ao React a chance de assentar esse trabalho assíncrono antes de
 * cada teste continuar.
 *
 * `{End}`/`{Home}` do teclado simulado NÃO são usados para posicionar o
 * cursor antes de editar. Causa raiz investigada e comprovada por leitura
 * do código-fonte instalado (`@testing-library/user-event@14.6.3`,
 * `event/behavior/keydown.js` + `event/selection/setSelectionRange.js`):
 * as duas teclas resolvem a posição via `setSelectionRange(target, ...)`,
 * que só suporta `<input>`/`<textarea>` OU um `contentEditable` cujo
 * `firstChild` seja diretamente um nó de texto (comentário da própria
 * biblioteca: "Handles input elements and contenteditable if it only
 * contains a single text node"). O Lexical sempre estrutura o conteúdo em
 * elementos de bloco (`<h1>`, `<p>`, `<li>`...) — `firstChild` nunca é um
 * nó de texto — então a função cai incondicionalmente em
 * `throw new Error('Not implemented. The result of this interaction is
 * unreliable.')`, qualquer que seja o conteúdo. NÃO é uma API de DOM
 * faltando no jsdom (diferente do polyfill de `Range` em `jest.setup.ts`)
 * — é um caminho específico da biblioteca sem suporte a editores
 * estruturados; nenhum polyfill resolve isso.
 *
 * `collapseSelectionAfterText` (abaixo) substitui `{End}`/`{Home}`
 * posicionando a seleção nativa do DOM diretamente, usando só
 * `Range`/`Selection` (implementados pelo jsdom independente de layout —
 * não precisam do polyfill de `Range` acima). O clique real
 * (`userEvent.click`) continua estabelecendo o foco; a digitação real
 * (`userEvent.keyboard`) continua disparando o pipeline real de
 * `beforeinput`/`input` do Lexical — nada na integração real deixa de ser
 * exercitado, só a forma de posicionar o cursor antes de digitar muda.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { ArticleBodyEditor } from './article-body-editor';

// Ported byte-a-byte de
// `spikes/lexical-editorial/corpus/persisted-current/carregador-usb-c-65w-gan-vale-a-pena.md`
// (evidência real da UXE-002 — round-trip já comprovado byte-idêntico).
const REAL_FIXTURE_BODY_MDX = `# Carregador USB-C 65W GaN vale a pena?

O Carregador USB-C 65W GaN é uma opção compacta para quem precisa carregar diferentes dispositivos no dia a dia ou durante viagens.

## Principais vantagens

A tecnologia GaN permite entregar alta potência em um carregador menor e mais fácil de transportar.

Com potência de até 65W, ele pode ser utilizado com celulares, tablets e notebooks compatíveis com USB-C Power Delivery.

## Para quem vale a pena?

É uma opção interessante principalmente para quem deseja levar apenas um carregador para vários dispositivos e reduzir a quantidade de acessórios na mochila.

## Conclusão

Para quem busca praticidade, potência e tamanho compacto, o Carregador USB-C 65W GaN pode ser uma excelente escolha.`;

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

/**
 * Posiciona a seleção nativa do DOM logo após o nó de texto cujo conteúdo
 * seja exatamente `targetText`, substituindo `{End}`/`{Home}` (ver
 * racional completo no comentário do topo do arquivo). Ancorar num texto
 * específico (em vez de "o último nó de texto do editor") evita depender
 * de em qual nó a digitação recairia — importante sobretudo no teste de
 * ênfase, onde anexar texto dentro de um nó em negrito/itálico herdaria
 * essa formatação (comportamento real do Lexical, não um efeito deste
 * helper) e quebraria a asserção de que o marcador original permanece
 * intacto; ancorar no trecho plano evita essa ambiguidade.
 */
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
      // jsdom não garante o disparo automático de `selectionchange` para
      // toda chamada de `Selection.addRange` — despachar explicitamente
      // garante que o listener de sincronização do próprio Lexical
      // (produção, inalterado) veja a nova seleção antes da digitação
      // seguinte.
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    node = walker.nextNode();
  }
  throw new Error(
    `collapseSelectionAfterText: nenhum nó de texto igual a ${JSON.stringify(targetText)} encontrado no editor.`,
  );
}

describe('ArticleBodyEditor', () => {
  it('nome acessível associado ao label visível "Corpo (Markdown)", role textbox, aria-multiline e contenteditable', async () => {
    await renderEditor();

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    expect(editor).toHaveAttribute('aria-multiline', 'true');
    expect(editor).toHaveAttribute('contenteditable', 'true');
  });

  it('alcançável por teclado via Tab e recebe foco visível', async () => {
    const user = userEvent.setup();
    await renderEditor();

    await user.tab();

    expect(screen.getByRole('textbox', { name: 'Corpo (Markdown)' })).toHaveFocus();
  });

  it('desabilitado (isSubmitting) reflete em contenteditable="false"', async () => {
    await renderEditor({ disabled: true });

    expect(screen.getByRole('textbox', { name: 'Corpo (Markdown)' })).toHaveAttribute('contenteditable', 'false');
  });

  it('importa heading (H1), lista não ordenada e link existentes com semântica correta', async () => {
    const input = '# Título\n\n- Item um\n- Item dois\n\n[FastCompre](https://fastcompre.com.br)';
    await renderEditor({ initialValue: input });

    expect(screen.getByRole('heading', { level: 1, name: 'Título' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'FastCompre' })).toHaveAttribute('href', 'https://fastcompre.com.br');
  });

  it('importa lista ordenada existente com semântica correta', async () => {
    await renderEditor({ initialValue: '1. Primeiro\n2. Segundo' });

    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('edição sobre heading existente preserva a estrutura na exportação (importação → edição → exportação)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '# Título Original', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      collapseSelectionAfterText(editor, 'Título Original');
    });
    await user.keyboard(' editado');

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const exported = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string;
    expect(exported.startsWith('# ')).toBe(true);
    expect(exported).toContain('editado');
  });

  it('edição sobre lista existente preserva a estrutura (itens continuam marcados como lista na exportação)', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '- Item um\n- Item dois', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      collapseSelectionAfterText(editor, 'Item um');
    });
    await user.keyboard(' extra');

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const exported = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string;
    expect(exported).toContain('- Item um');
    expect(exported).toContain('extra');
  });

  it('edição em documento com ênfase (negrito/itálico) preserva os marcadores na exportação', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '**negrito** e *itálico*', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    // Ancorado no trecho plano (" e ") entre os dois trechos formatados —
    // ver o racional completo no comentário de `collapseSelectionAfterText`.
    act(() => {
      collapseSelectionAfterText(editor, ' e ');
    });
    await user.keyboard(' fim');

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const exported = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string;
    expect(exported).toContain('**negrito**');
    expect(exported).toContain('*itálico*');
    expect(exported).toContain('fim');
  });

  it('regressão: carregar um bodyMdx real pré-existente sem editar nunca chama onChange (permanece byte-idêntico)', async () => {
    const onChange = jest.fn();
    await renderEditor({ initialValue: REAL_FIXTURE_BODY_MDX, onChange });

    await screen.findByRole('heading', { level: 1, name: 'Carregador USB-C 65W GaN vale a pena?' });
    // Dá chance a qualquer microtask/efeito pendente de rodar antes de
    // afirmar a ausência de chamadas.
    await waitFor(() => expect(onChange).not.toHaveBeenCalled());
  });

  it('a primeira notificação real de edição (após o import) já chama onChange com o Markdown atualizado — nenhuma edição real é descartada por posição ordinal; edições seguintes continuam chamando onChange normalmente', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderEditor({ initialValue: '# Título Original', onChange });

    const editor = screen.getByRole('textbox', { name: 'Corpo (Markdown)' });
    await user.click(editor);
    act(() => {
      collapseSelectionAfterText(editor, 'Título Original');
    });
    await user.keyboard('X');

    // A primeira chamada registrada em onChange (calls[0], não uma chamada
    // posterior) já precisa refletir esta edição — comprova que o
    // mecanismo de baseline não descarta a primeira notificação real,
    // diferente da versão anterior (que descartava incondicionalmente a
    // primeira notificação recebida, por posição ordinal).
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const callsAfterFirstEdit = onChange.mock.calls.length;
    expect(onChange.mock.calls[0]?.[0]).toContain('X');

    await user.keyboard('Y');

    // Uma segunda edição real continua chamando onChange normalmente
    // (o mecanismo não some depois de uma única chamada).
    await waitFor(() => expect(onChange.mock.calls.length).toBeGreaterThan(callsAfterFirstEdit));
    const lastCallMarkdown = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string;
    expect(lastCallMarkdown).toContain('XY');
  });

  it('jest-axe: sem violação de acessibilidade automatizada', async () => {
    const { container } = await renderEditor({ initialValue: 'Texto simples.' });

    expect(await axe(container)).toHaveNoViolations();
  });
});
