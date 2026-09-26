'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { Image as ImageIcon, Link as LinkIcon, List, ListOrdered, Quote } from 'lucide-react';
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
import type { ImageInsertionAnchor } from './article-body-image-flow';
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
 *
 * UXE-022 — toolbar compacta com ícones (`lucide-react`, já dependência
 * existente). Cada botão troca o texto visível por um ícone decorativo
 * (`aria-hidden`) e ganha `aria-label`/`title` com o MESMO texto que antes
 * era o conteúdo visível do botão (ex.: "Negrito") — o nome acessível não
 * muda, só deixa de vir do texto e passa a vir do atributo. Título 1/2/3
 * continuam mostrando texto ("H1"/"H2"/"H3", já que `lucide-react` não tem
 * glifos numerados de heading) só que como glifo compacto, com
 * `aria-label`/`title` preservando o rótulo por extenso ("Título 1", etc.).
 * `aria-pressed`, `onMouseDown={preventMouseDown}`, foco visível e a caixa
 * mínima 36×36px (`.toolbar button`, `article-form.module.css`) são
 * preservados sem nenhuma mudança de lógica.
 *
 * UXE-022 (rodada 4 — fidelidade V3) — Negrito/Itálico passam de ícone
 * `lucide-react` para glifo textual ("B"/"I"), mesmo tratamento que já
 * existia para Título 1/2/3, para reproduzir a V3 (`B/I/H1/H2/H3 conforme
 * a referência`, decisão explícita do Addendum 3). Citação/Lista/Lista
 * numerada/Link/Imagem continuam como ícone `lucide-react` (a V3 também
 * usa pictograma para esses). `aria-label`/`title`/`aria-pressed`/
 * `onMouseDown`/estado — tudo intocado, só o CONTEÚDO VISUAL de dois
 * botões muda. Separadores finos (`styles.toolbarSeparator`,
 * `aria-hidden`, sem papel semântico — só divisor visual entre grupos,
 * mesmo agrupamento da V3) são inseridos entre os grupos de botões; nenhum
 * botão novo é adicionado (o bloco "/" de inserção da V3 não tem
 * correspondência funcional aprovada aqui — permanece fora de escopo).
 */

type ActiveBlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullet' | 'number';

const HEADING_LEVELS: Array<{ tag: HeadingTagType; label: string; glyph: string }> = [
  { tag: 'h1', label: 'Título 1', glyph: 'H1' },
  { tag: 'h2', label: 'Título 2', glyph: 'H2' },
  { tag: 'h3', label: 'Título 3', glyph: 'H3' },
];

/**
 * Tamanho do ícone dentro da caixa 36×36px preservada do botão
 * (`.toolbar button`, `article-form.module.css`) — UXE-022.
 * UXE-022 (correção pós-validação visual) — `TOOLBAR_ICON_SIZE` sobe de
 * 18 para 20, e `TOOLBAR_ICON_STROKE` (peso do traço do ícone,
 * `strokeWidth` do `lucide-react`) sobe do padrão da lib (2) para 2.25,
 * só para dar mais presença visual aos ícones (feedback do PO: "ficaram
 * muito pequenos/leve visualmente") — a caixa do botão continua 36×36.
 * UXE-022 (rodada 4 — fidelidade V3) — reduzido para 15/1.6 para
 * corresponder ao peso mais leve dos ícones da V3 (Citação/Lista/Lista
 * numerada/Link/Imagem); a caixa do botão continua 36×36 real
 * (`.toolbar button`), só a aparência interna muda.
 */
const TOOLBAR_ICON_SIZE = 15;
const TOOLBAR_ICON_STROKE = 1.6;

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

interface ArticleBodyToolbarProps {
  disabled?: boolean;
  /**
   * UXE-010 — disparo síncrono do fluxo compartilhado de imagem (ver doc
   * comment de `ArticleBodyImageFlow`). Este componente só faz seu
   * próprio preparo síncrono (capturar a seleção/bloco atuais, sem
   * alterar o documento — diferente do menu `/`, que remove o `/query`
   * antes) e entrega a âncora resultante; upload/diálogo/inserção
   * acontecem inteiramente fora daqui.
   */
  onRequestImage: (anchor: ImageInsertionAnchor) => void;
}

export function ArticleBodyToolbar({ disabled = false, onRequestImage }: ArticleBodyToolbarProps) {
  const [editor] = useLexicalComposerContext();

  const [blockType, setBlockType] = useState<ActiveBlockType>('paragraph');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [isSelectionCollapsed, setIsSelectionCollapsed] = useState(true);
  // UXE-010 — botão "Imagem" fica desabilitado sem seleção Lexical
  // válida (mesmo precedente já usado pelo botão "Link" acima/abaixo,
  // `disabled || (!isLink && isSelectionCollapsed)`): evita por
  // construção o caso "acionado sem seleção", em vej de inventar um
  // destino de inserção default silencioso caso isso aconteça mesmo
  // assim (ver `handleRequestImage`, que também nunca insere por
  // padrão nesse caso).
  const [hasValidSelection, setHasValidSelection] = useState(false);

  const [isEditingLink, setIsEditingLink] = useState(false);
  const [linkUrlDraft, setLinkUrlDraft] = useState('');
  const savedSelectionRef = useRef<RangeSelection | null>(null);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          setHasValidSelection(false);
          return;
        }
        setIsBold(selection.hasFormat('bold'));
        setIsItalic(selection.hasFormat('italic'));
        setBlockType($getActiveBlockType(selection));
        setIsLink(findNearestLinkNode(selection.anchor.getNode()) !== null);
        setIsSelectionCollapsed(selection.isCollapsed());
        setHasValidSelection(true);
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

  /**
   * Preparo síncrono da toolbar (UXE-010): captura a seleção atual
   * (clonada, mesmo princípio já usado por `openLinkForm` acima) e o
   * bloco de nível superior correspondente, sem alterar o documento —
   * `onRequestImage` decide o resto. Se não houver seleção válida no
   * instante do clique (defensivo — o botão já fica `disabled` nesse
   * caso, ver `hasValidSelection`), não faz nada: nunca insere em
   * nenhum destino default.
   */
  function handleRequestImage() {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return;
      }
      const blockElement = $getBlockElement(selection.anchor.getNode());
      if (!blockElement) {
        return;
      }
      onRequestImage({ mode: 'insert-after', blockKey: blockElement.getKey(), restoreSelection: selection.clone() });
    });
  }

  const isInList = blockType === 'bullet' || blockType === 'number';
  const linkLabel = isLink ? 'Editar link' : 'Link';

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formatação do corpo do Artigo">
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={toggleBold}
        aria-pressed={isBold}
        disabled={disabled}
        aria-label="Negrito"
        title="Negrito"
      >
        <span aria-hidden="true" className={styles.toolbarGlyphBold}>
          B
        </span>
      </button>
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={toggleItalic}
        aria-pressed={isItalic}
        disabled={disabled}
        aria-label="Itálico"
        title="Itálico"
      >
        <span aria-hidden="true" className={styles.toolbarGlyphItalic}>
          I
        </span>
      </button>
      <span className={styles.toolbarSeparator} aria-hidden="true" />
      {HEADING_LEVELS.map(({ tag, label, glyph }) => (
        <button
          key={tag}
          type="button"
          onMouseDown={preventMouseDown}
          onClick={() => toggleHeading(tag)}
          aria-pressed={blockType === tag}
          disabled={disabled || isInList}
          aria-label={label}
          title={label}
        >
          <span aria-hidden="true" className={styles.toolbarGlyphHeading}>
            {glyph}
          </span>
        </button>
      ))}
      <span className={styles.toolbarSeparator} aria-hidden="true" />
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={toggleQuote}
        aria-pressed={blockType === 'quote'}
        disabled={disabled || isInList}
        aria-label="Citação"
        title="Citação"
      >
        <Quote aria-hidden="true" size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={toggleUnorderedList}
        aria-pressed={blockType === 'bullet'}
        disabled={disabled}
        aria-label="Lista"
        title="Lista"
      >
        <List aria-hidden="true" size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_ICON_STROKE} />
      </button>
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={toggleOrderedList}
        aria-pressed={blockType === 'number'}
        disabled={disabled}
        aria-label="Lista numerada"
        title="Lista numerada"
      >
        <ListOrdered aria-hidden="true" size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_ICON_STROKE} />
      </button>
      <span className={styles.toolbarSeparator} aria-hidden="true" />
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={openLinkForm}
        aria-pressed={isLink}
        disabled={disabled || (!isLink && isSelectionCollapsed)}
        aria-label={linkLabel}
        title={linkLabel}
      >
        <LinkIcon aria-hidden="true" size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_ICON_STROKE} />
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
      <button
        type="button"
        onMouseDown={preventMouseDown}
        onClick={handleRequestImage}
        disabled={disabled || !hasValidSelection}
        aria-label="Imagem"
        title="Imagem"
      >
        <ImageIcon aria-hidden="true" size={TOOLBAR_ICON_SIZE} strokeWidth={TOOLBAR_ICON_STROKE} />
      </button>
    </div>
  );
}
