'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  FORMAT_TEXT_COMMAND,
  type ElementNode,
  type LexicalNode,
  type RangeSelection,
} from 'lexical';
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode, type HeadingTagType } from '@lexical/rich-text';
import { $isListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND } from '@lexical/list';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { $getBlockElement } from './article-body-block-utils';
import styles from './article-form.module.css';

/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-toolbar.tsx
 *
 * UXE-007 — Toolbar e menu de comando `/`.
 *
 * Toolbar com as formatações já suportadas pelo editor base da UXE-006:
 * negrito, itálico, título (H1-H3), citação, lista não ordenada/ordenada e
 * link. Nenhuma formatação nova é introduzida — cada botão só aciona
 * comandos/transformações que os `TRANSFORMERS`/nodes já registrados em
 * `article-body-editor.tsx` já sabem exportar/importar como Markdown.
 *
 * Sem dependência nova: `$setBlocksType` (pacote `@lexical/selection`, não
 * instalado) é substituído por `$replaceSelectedBlocks`, uma reimplementação
 * mínima do essencial (trocar o(s) nó(s) de bloco de nível superior por um
 * novo tipo, preservando os filhos) usando só APIs núcleo de `lexical`
 * (`.replace()`, `.append()`, `.getChildren()`), já e sempre disponíveis
 * nesse pacote. A resolução do próprio elemento de bloco usa
 * `$getBlockElement` (`./article-body-block-utils.ts`, compartilhado com
 * `article-body-slash-menu.tsx`) — sem cast: `$isElementNode` estreita o
 * tipo por type guard real em vez de comparar `getKey() === 'root'`
 * (comparação de string não estreita `TextNode | ElementNode` para o
 * TypeScript).
 *
 * Cada botão usa `onMouseDown={preventMouseDown}` — sem isso, o clique no
 * botão tiraria o foco (e a seleção nativa) do `contentEditable` antes do
 * `onClick` rodar, invalidando a seleção que o comando precisa. É o mesmo
 * motivo pelo qual os botões da paleta de comando não precisam disso (eles
 * nunca dependem de uma seleção dentro de outro elemento focável).
 *
 * Título/Citação: apenas H1-H3 são expostos aqui (o editor base já
 * suporta um range maior por herança do próprio `HEADING`/`HeadingNode`,
 * mas nenhum nível além de H1-H3 foi pedido nem testado nesta tarefa —
 * documentos existentes com H4-H6 continuam importáveis/preserváveis
 * normalmente, só não são criáveis por este botão). Clicar num nível já
 * ativo reverte para parágrafo — mesmo critério de toggle já usado em
 * negrito/itálico/lista.
 *
 * Link: nunca usa `window.prompt()`. Ao clicar, a seleção Lexical atual é
 * clonada (`RangeSelection.clone()`) antes do foco sair do editor para o
 * campo de URL do mini-formulário inline; "Confirmar"/"Remover link"
 * restauram essa seleção clonada dentro do mesmo `editor.update()` antes de
 * despachar `TOGGLE_LINK_COMMAND` — não depende da seleção nativa do DOM
 * continuar válida depois que o foco já mudou para um elemento fora do
 * editor. "Cancelar" nunca despacha nada (o link só é criado/alterado no
 * documento em "Confirmar"/"Remover link") — nenhum estado é sujado por um
 * fluxo cancelado.
 */

type ActiveBlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullet' | 'number';

const HEADING_LEVELS: Array<{ tag: HeadingTagType; label: string }> = [
  { tag: 'h1', label: 'Título 1' },
  { tag: 'h2', label: 'Título 2' },
  { tag: 'h3', label: 'Título 3' },
];

function preventMouseDown(event: ReactMouseEvent): void {
  event.preventDefault();
}

function findNearestLinkNode(node: LexicalNode) {
  let current: LexicalNode | null = node;
  while (current !== null) {
    if ($isLinkNode(current)) {
      return current;
    }
    current = current.getParent();
  }
  return null;
}

function $getActiveBlockType(selection: RangeSelection): ActiveBlockType {
  const element = $getBlockElement(selection.anchor.getNode());
  if (!element) {
    return 'paragraph';
  }

  if ($isListNode(element)) {
    return element.getListType() === 'number' ? 'number' : 'bullet';
  }
  if ($isHeadingNode(element)) {
    const tag = element.getTag();
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      return tag;
    }
    return 'paragraph';
  }
  if ($isQuoteNode(element)) {
    return 'quote';
  }
  return 'paragraph';
}

/**
 * Reimplementação mínima do essencial de `$setBlocksType` (ver doc comment
 * do arquivo). Ignora nós de lista deliberadamente — converter um item de
 * lista em título/citação por este caminho produziria uma estrutura
 * ambígua; alternar lista tem seu próprio fluxo dedicado
 * (`INSERT_*_LIST_COMMAND`/`REMOVE_LIST_COMMAND`, já usados abaixo).
 */
function $replaceSelectedBlocks(selection: RangeSelection, createElement: () => ElementNode): void {
  const topLevelNodes = new Set<ElementNode>();
  for (const node of selection.getNodes()) {
    const topLevel = $getBlockElement(node);
    if (topLevel && !$isListNode(topLevel)) {
      topLevelNodes.add(topLevel);
    }
  }
  topLevelNodes.forEach((oldNode) => {
    const newElement = createElement();
    oldNode.getChildren().forEach((child) => newElement.append(child));
    oldNode.replace(newElement);
  });
}

export function ArticleBodyToolbar({ disabled = false }: { disabled?: boolean }) {
  const [editor] = useLexicalComposerContext();

  const [blockType, setBlockType] = useState<ActiveBlockType>('paragraph');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [isSelectionCollapsed, setIsSelectionCollapsed] = useState(true);

  const [isEditingLink, setIsEditingLink] = useState(false);
  const [linkUrlDraft, setLinkUrlDraft] = useState('');
  const savedSelectionRef = useRef<RangeSelection | null>(null);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }
        setIsBold(selection.hasFormat('bold'));
        setIsItalic(selection.hasFormat('italic'));
        setBlockType($getActiveBlockType(selection));
        setIsLink(findNearestLinkNode(selection.anchor.getNode()) !== null);
        setIsSelectionCollapsed(selection.isCollapsed());
      });
    });
  }, [editor]);

  function toggleBold() {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
  }

  function toggleItalic() {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
  }

  function toggleHeading(tag: HeadingTagType) {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return;
      }
      if (blockType === tag) {
        $replaceSelectedBlocks(selection, () => $createParagraphNode());
      } else {
        $replaceSelectedBlocks(selection, () => $createHeadingNode(tag));
      }
    });
  }

  function toggleQuote() {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return;
      }
      if (blockType === 'quote') {
        $replaceSelectedBlocks(selection, () => $createParagraphNode());
      } else {
        $replaceSelectedBlocks(selection, () => $createQuoteNode());
      }
    });
  }

  function toggleUnorderedList() {
    if (blockType === 'bullet') {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    }
  }

  function toggleOrderedList() {
    if (blockType === 'number') {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    }
  }

  function openLinkForm() {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return;
      }
      savedSelectionRef.current = selection.clone();
      const existingLink = findNearestLinkNode(selection.anchor.getNode());
      setLinkUrlDraft(existingLink ? existingLink.getURL() : '');
    });
    setIsEditingLink(true);
  }

  function confirmLink() {
    const url = linkUrlDraft.trim();
    if (url === '') {
      return;
    }
    editor.update(() => {
      if (savedSelectionRef.current) {
        $setSelection(savedSelectionRef.current);
      }
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    });
    setIsEditingLink(false);
  }

  function removeLink() {
    editor.update(() => {
      if (savedSelectionRef.current) {
        $setSelection(savedSelectionRef.current);
      }
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    });
    setIsEditingLink(false);
  }

  function cancelLink() {
    setIsEditingLink(false);
  }

  const isInList = blockType === 'bullet' || blockType === 'number';

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formatação do corpo do Artigo">
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={toggleBold}
        aria-pressed={isBold}
        disabled={disabled}
      >
        Negrito
      </button>
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={toggleItalic}
        aria-pressed={isItalic}
        disabled={disabled}
      >
        Itálico
      </button>
      {HEADING_LEVELS.map(({ tag, label }) => (
        <button
          key={tag}
          type="button"
          onMouseDown={preventMouseDown}
          onClick={() => toggleHeading(tag)}
          aria-pressed={blockType === tag}
          disabled={disabled || isInList}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={toggleQuote}
        aria-pressed={blockType === 'quote'}
        disabled={disabled || isInList}
      >
        Citação
      </button>
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={toggleUnorderedList}
        aria-pressed={blockType === 'bullet'}
        disabled={disabled}
      >
        Lista
      </button>
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={toggleOrderedList}
        aria-pressed={blockType === 'number'}
        disabled={disabled}
      >
        Lista numerada
      </button>
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={openLinkForm}
        aria-pressed={isLink}
        disabled={disabled || (!isLink && isSelectionCollapsed)}
      >
        {isLink ? 'Editar link' : 'Link'}
      </button>
      {isEditingLink && (
        <div className={styles.linkForm} role="group" aria-label="Link">
          <label htmlFor="article-body-link-url">URL do link</label>
          <input
            id="article-body-link-url"
            type="url"
            autoFocus
            value={linkUrlDraft}
            onChange={(event) => setLinkUrlDraft(event.target.value)}
          />
          <button type="button" onClick={confirmLink}>
            Confirmar
          </button>
          <button type="button" onClick={cancelLink}>
            Cancelar
          </button>
          {isLink && (
            <button type="button" onClick={removeLink}>
              Remover link
            </button>
          )}
        </div>
      )}
    </div>
  );
}
