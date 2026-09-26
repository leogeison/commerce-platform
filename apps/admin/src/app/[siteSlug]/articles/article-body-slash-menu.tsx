'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalEditor,
  type NodeKey,
} from 'lexical';
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from '@lexical/rich-text';
import { $createListItemNode, $createListNode } from '@lexical/list';
import {
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  Package,
  Quote,
  type LucideIcon,
} from 'lucide-react';
import { $getBlockElement } from './article-body-block-utils';
import type { ImageInsertionAnchor } from './article-body-image-flow';
import type { ProductBlockInsertionAnchor } from './article-body-product-flow';
import { useProductLookup } from './product-lookup-context';
import styles from './article-form.module.css';

/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-slash-menu.tsx
 *
 * UXE-007 — Toolbar e menu de comando `/`.
 *
 * Escopo original desta tarefa: só os itens cuja capacidade já existia no
 * editor base (título H1-H3, lista não ordenada/ordenada). "Bloco
 * Produto-Oferta" (seleção/inserção/edição funcional sobre
 * `ArticleProduct`) nasceu só na UXE-011 — até lá, ficou deliberadamente
 * ausente do menu (um item ausente nunca é um item quebrado). A partir da
 * UXE-011 o item passa a existir sempre (ver doc comment mais abaixo,
 * parágrafo "Bloco Produto-Oferta (UXE-011...)"), podendo estar
 * indisponível (nunca ausente) quando não há Artigo persistido.
 *
 * "Imagem" (UXE-010, adicionado nesta rodada): cumpre o que esta própria
 * tarefa já havia reservado ("menu `/` para inserir título/lista/imagem/
 * bloco Produto-Oferta") — construído dentro do componente (não em
 * `SLASH_MENU_ITEMS`, module-level) porque precisa de `onRequestImage`.
 * Seu `apply` continua síncrono: remove `/query` do bloco atual e entrega
 * a âncora resultante ao fluxo compartilhado de imagem
 * (`ArticleBodyImageFlow`) — upload/diálogo/inserção acontecem fora do
 * menu. Ver doc comment de `ArticleBodySlashMenuProps.onRequestImage`.
 *
 * "Bloco Produto-Oferta" (UXE-011, adicionado nesta rodada): mesmo padrão
 * de `apply` síncrono de "Imagem" — entrega a âncora resultante a
 * `onRequestProductBlock` (`ArticleBodyProductFlow`, seleção/inserção
 * acontecem fora do menu). Diferença nova: este item pode estar
 * INDISPONÍVEL (`/articles/new`, sem `articleId` — `ProductLookupContext`
 * em `overallStatus: 'unavailable'`) — nunca removido do menu (item
 * ausente não é o padrão aprovado para este caso; a UXE-007 já cobria
 * "nenhum item leva a estado quebrado", e um item omitido não explica por
 * que sumiu). Em vez disso, o item permanece visível, com
 * `disabledReason` preenchido — texto SEMPRE renderizado ao lado do
 * rótulo (nunca hover/tooltip-only) e incluído na região viva
 * (`role="status"`) quando o item está ativo — explicação acessível real,
 * não só visual. `disabledReason` é um campo SEPARADO de `label`,
 * propositalmente: `matchesSlashQuery` só compara contra `label` (rótulo
 * curto "Bloco Produto-Oferta", sem "i"/"n"/"m" — não colide com nenhuma
 * query existente, ex. "/tit"/"/lista"/"/numerada"/"/imagem"); embutir a
 * explicação dentro do próprio `label` correspondido quebraria esse
 * casamento por subsequência (uma frase longa o bastante acaba casando
 * queries que não deveriam bater — verificado manualmente antes desta
 * implementação).
 *
 * Implementação deliberadamente sem `LexicalTypeaheadMenuPlugin`
 * (`@lexical/react`): não foi possível confirmar neste ambiente o shape
 * exato dessa API na versão instalada (`node_modules` inacessível pela
 * ponte de dispositivo usada nesta sessão — I/O error ao seguir os
 * symlinks do pnpm). Para não arriscar quebrar o build com um caminho de
 * importação não verificável, o menu é implementado só com APIs núcleo já
 * usadas e comprovadas nesta base de código (`registerUpdateListener`,
 * `registerCommand`, `$getSelection`, `.replace()`, `.select()`) — mesmo
 * espírito de "sem infraestrutura antecipada" do desenho aprovado.
 *
 * Gatilho: o bloco (parágrafo/heading/citação) atual precisa conter
 * exatamente `/` seguido da query, do início ao cursor — não dispara no
 * meio de uma frase (ex.: "1/2" nunca casa, pois o texto do bloco não
 * começa com "/"). Ao confirmar um item, o texto `/query` digitado é
 * removido (`blockElement.clear()`) antes do novo bloco ser criado — o
 * usuário nunca vê o texto do comando sobrar no conteúdo final.
 *
 * UXE-022 (Addendum 7, investigação; implementação nesta rodada) — o menu
 * deixou de ser um bloco estático abaixo da área editável e passou a ser um
 * popover flutuante ancorado ao caret, estilo Gutenberg/WordPress. Trigger,
 * filtro, comandos de teclado e estrutura ARIA (ver abaixo) permanecem 100%
 * intocados — só posicionamento/renderização mudam:
 * - Posição: `getCaretRect()` lê `window.getSelection().getRangeAt(0)
 *   .getBoundingClientRect()`. jsdom (testes) sempre devolve um retângulo
 *   com todos os campos zerados (sem layout real) — `isDegenerateRect`
 *   detecta esse caso e o trata como "não mensurável" (um caret real nunca
 *   fica exatamente na origem da viewport), caindo no fallback:
 *   `editor.getRootElement()?.getBoundingClientRect()`. Testes que precisam
 *   de uma posição real mockam `Range.prototype.getBoundingClientRect`.
 * - Renderização: `createPortal(..., document.body)` com `position: fixed`
 *   — necessário porque `.editorCard` (`article-form.module.css`) tem
 *   `overflow: hidden`, que cortaria um popover posicionado dentro dele.
 *   Só é alcançado client-side (o componente já só monta depois de
 *   `isMounted` no `ArticleBodyEditor` pai — sem risco de SSR).
 * - Collision handling (clamp/flip): depois de renderizado, o tamanho real
 *   do popover (`menuRef`) é medido e a posição é ajustada para nunca
 *   estourar a viewport horizontalmente (clamp) e para abrir acima do caret
 *   quando não há espaço suficiente abaixo (flip) — sem biblioteca nova.
 * - Reposição: listeners de `scroll` (capture, para pegar containers
 *   internos com scroll) e `resize` recalculam a posição enquanto o menu
 *   está aberto.
 * - Fechar ao clicar fora: listener de `pointerdown` em `document` enquanto
 *   o menu está visível — ignora eventos originados dentro do próprio
 *   popover ou do `contentEditable` do editor (o foco nunca sai do editor;
 *   não depende de `blur`, que sairia do `contentEditable`).
 *
 * Correspondência de query sem acento (correção desta rodada): os rótulos
 * do menu contêm acentos ("Título"), mas uma consulta comum como "/tit"
 * (tentativa razoável de digitar "título" sem acento) não batia contra
 * "Título" — a subsequência ordenada comparava caractere a caractere só
 * após `.toLowerCase()`, e `í` (U+00ED) nunca é igual a `i` (U+0069)
 * nessa comparação, então a query inteira falhava e o menu mostrava
 * "Nenhum resultado encontrado" mesmo com opções correspondentes reais.
 * `normalizeForMatch` usa `String.prototype.normalize('NFD')` (API nativa
 * do motor JS, sem dependência nova) para decompor cada caractere
 * acentuado em base + marca diacrítica combinante, remove as marcas
 * (intervalo Unicode U+0300–U+036F) e só então aplica `.toLowerCase()` —
 * "Título" e "tit" passam a comparar "titulo 1"/"tit", que batem
 * normalmente.
 * `matchesSlashQuery` é local a este arquivo (não reaproveita mais
 * `matchesQuery` de `command-palette.tsx`): os rótulos da paleta de
 * comando (Artigos, Produtos, Categorias, Autores, Novo Artigo...) não têm
 * acento, então esse bug não existe lá — mudar `matchesQuery` alteraria
 * comportamento de uma tarefa já aprovada e commitada (UXA-009/010) fora
 * do escopo desta correção.
 *
 * Estrutura ARIA (corrigida nesta rodada): `aria-expanded`/`aria-haspopup`
 * continuam ausentes — o Axe comprovou que nenhum dos dois é permitido em
 * `role="textbox"`, e isso não muda. O que muda é que a rodada anterior
 * também removeu `aria-controls`/`aria-activedescendant`, que SÃO válidos
 * nesse papel (tabela de características de papel da ARIA 1.2:
 * `aria-activedescendant` e `aria-autocomplete` são propriedades
 * suportadas por `role="textbox"`; `aria-controls` é uma propriedade ARIA
 * global, válida em qualquer papel que não a proíba explicitamente) — e
 * são exatamente o vínculo semântico de combobox que faltava. Sem essa
 * correção a região `role="status"` ficava sendo o único mecanismo de
 * exposição do estado, o que não atende ao critério da UXE-007 de menu
 * `/` como padrão de combobox acessível (mesmo critério da UXA-009).
 * `role="textbox"` do `contentEditable` (definido em
 * `article-body-editor.tsx`) permanece intocado como papel — não vira
 * `role="combobox"` (a ARIA define combobox como um textbox de UMA LINHA
 * associado a um popup; o nosso é `aria-multiline="true"`, então trocar o
 * papel violaria a própria definição de combobox da spec). A relação de
 * combobox é expressa, em vez disso, pelas três propriedades citadas,
 * aplicadas/removidas imperativamente no elemento raiz do editor pelo
 * efeito abaixo: `aria-autocomplete="list"` e `aria-controls` apontando
 * para o `id` do `listbox` enquanto o menu está aberto, e
 * `aria-activedescendant` apontando para o `id` da opção ativa — inclusive
 * quando não há resultado, caso em que o `listbox` permanece montado com
 * uma única opção não selecionável ("Nenhum resultado encontrado",
 * `aria-disabled`), para que `aria-controls`/`aria-activedescendant`
 * nunca apontem para um `id` inexistente. A região viva (`role="status"`,
 * sempre montada, visualmente oculta via `.srOnly` — nunca
 * `display:none`) permanece como canal complementar, anunciando a opção
 * ativa em texto corrido — não é mais o único mecanismo, só um reforço. O
 * foco do DOM nunca sai do `contentEditable`; teclado continua
 * funcionando via `registerCommand` abaixo.
 */

interface SlashMenuItem {
  id: string;
  label: string;
  /**
   * UXE-022 (Addendum 7) — ícone renderizado à esquerda do rótulo no
   * popover, estilo Gutenberg/WordPress. `lucide-react`, já dependência
   * existente (mesmo pacote usado por `article-body-toolbar.tsx`).
   */
  icon: LucideIcon;
  /**
   * UXE-011 — quando presente, o item permanece visível no menu (nunca
   * removido) mas não pode ser confirmado (`selectResult` ignora
   * clique/Enter/Tab sobre ele) — texto sempre renderizado ao lado do
   * rótulo e incluído na região viva quando o item está ativo, nunca só
   * hover/tooltip. `undefined` (padrão) — item normal, sempre confirmável.
   */
  disabledReason?: string;
  apply: (editor: LexicalEditor) => void;
}

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchesSlashQuery(label: string, query: string): boolean {
  const normalizedQuery = normalizeForMatch(query.trim());
  if (normalizedQuery === '') {
    return true;
  }
  const normalizedLabel = normalizeForMatch(label);
  let queryIndex = 0;
  for (
    let labelIndex = 0;
    labelIndex < normalizedLabel.length && queryIndex < normalizedQuery.length;
    labelIndex++
  ) {
    if (normalizedLabel[labelIndex] === normalizedQuery[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === normalizedQuery.length;
}

function applyHeadingFromEmptyBlock(editor: LexicalEditor, tag: HeadingTagType): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    const blockElement = $getBlockElement(selection.anchor.getNode());
    if (!blockElement) {
      return;
    }
    blockElement.clear();
    const heading = $createHeadingNode(tag);
    blockElement.replace(heading);
    heading.select();
  });
}

/**
 * UXE-022 (Addendum 7) — densidade compacta do popover Gutenberg/WordPress:
 * ícones menores e traço mais fino que a toolbar principal
 * (`TOOLBAR_ICON_SIZE`/`TOOLBAR_ICON_STROKE` em `article-body-toolbar.tsx`),
 * adequados ao espaço reduzido de uma linha de opção do menu.
 */
const SLASH_MENU_ICON_SIZE = 16;
const SLASH_MENU_ICON_STROKE = 1.75;

function applyQuoteFromEmptyBlock(editor: LexicalEditor): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    const blockElement = $getBlockElement(selection.anchor.getNode());
    if (!blockElement) {
      return;
    }
    blockElement.clear();
    const quote = $createQuoteNode();
    blockElement.replace(quote);
    quote.select();
  });
}

function applyListFromEmptyBlock(editor: LexicalEditor, listType: 'bullet' | 'number'): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    const blockElement = $getBlockElement(selection.anchor.getNode());
    if (!blockElement) {
      return;
    }
    const listNode = $createListNode(listType);
    const listItem = $createListItemNode();
    listNode.append(listItem);
    blockElement.replace(listNode);
    listItem.select();
  });
}

/**
 * UXE-022 (Addendum 7) — ordem aprovada pelo Product Owner para o popover:
 * Lista, Lista numerada, Título 1, Título 2, Título 3, Citação (seguidos de
 * Imagem e Bloco de Produto, construídos dentro do componente abaixo por
 * dependerem de `onRequestImage`/`onRequestProductBlock`). "Citação" é
 * capacidade já existente no editor (mesma `$createQuoteNode()` usada por
 * `article-body-toolbar.tsx`, função `toggleQuote`) — apenas exposta aqui
 * pela primeira vez, nenhuma capability nova.
 */
const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  { id: 'list-bullet', label: 'Lista', icon: List, apply: (editor) => applyListFromEmptyBlock(editor, 'bullet') },
  {
    id: 'list-number',
    label: 'Lista numerada',
    icon: ListOrdered,
    apply: (editor) => applyListFromEmptyBlock(editor, 'number'),
  },
  { id: 'heading-1', label: 'Título 1', icon: Heading1, apply: (editor) => applyHeadingFromEmptyBlock(editor, 'h1') },
  { id: 'heading-2', label: 'Título 2', icon: Heading2, apply: (editor) => applyHeadingFromEmptyBlock(editor, 'h2') },
  { id: 'heading-3', label: 'Título 3', icon: Heading3, apply: (editor) => applyHeadingFromEmptyBlock(editor, 'h3') },
  { id: 'quote', label: 'Citação', icon: Quote, apply: (editor) => applyQuoteFromEmptyBlock(editor) },
];

/**
 * UXE-022 (Addendum 7) — jsdom (testes) não implementa layout real:
 * `getBoundingClientRect()` sempre devolve um retângulo com todos os
 * campos zerados. Um caret real nunca fica exatamente na origem da
 * viewport (atrás do chrome do navegador), então tratar esse caso
 * específico como "não mensurável" é seguro. Testes que precisam de uma
 * posição real mockam `Range.prototype.getBoundingClientRect`.
 */
function isDegenerateRect(rect: DOMRect): boolean {
  return rect.top === 0 && rect.left === 0 && rect.bottom === 0 && rect.right === 0;
}

function getCaretRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return isDegenerateRect(rect) ? null : rect;
}

interface ArticleBodySlashMenuProps {
  disabled?: boolean;
  /**
   * UXE-010 — mesmo fluxo compartilhado usado por `ArticleBodyToolbar`
   * (`onRequestImage`), nunca duplicado aqui. Diferença de preparo:
   * este menu remove `/query` do bloco (`blockElement.clear()`) ANTES de
   * entregar a âncora — o bloco resultante já vazio é o que
   * `ArticleBodyImageFlow` usa tanto para inserir (substituindo-o
   * exatamente) quanto para devolver o caret em caso de cancelamento
   * (nunca tenta restaurar a seleção anterior que apontava para o texto
   * `/query`, que não existe mais nesse ponto).
   */
  onRequestImage: (anchor: ImageInsertionAnchor) => void;
  /**
   * UXE-011 — mesmo fluxo compartilhado usado pelo item "Bloco
   * Produto-Oferta" deste menu: `apply` só remove `/query` do bloco atual
   * (quando o item não está desabilitado) e entrega a âncora resultante a
   * `ArticleBodyProductFlow` — seleção do Produto/inserção acontecem fora
   * deste menu.
   */
  onRequestProductBlock: (anchor: ProductBlockInsertionAnchor) => void;
}

export function ArticleBodySlashMenu({ disabled = false, onRequestImage, onRequestProductBlock }: ArticleBodySlashMenuProps) {
  const [editor] = useLexicalComposerContext();
  const { overallStatus } = useProductLookup();
  const baseId = useId();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // UXE-022 (Addendum 7) — popover flutuante: `menuRef` mede o card
  // renderizado (para o collision handling); `position`/`positionTick` ver
  // o `useLayoutEffect` de posicionamento mais abaixo.
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [positionTick, setPositionTick] = useState(0);

  /**
   * "Imagem" (UXE-010) é construído aqui dentro (não em
   * `SLASH_MENU_ITEMS`, que é módulo-level e não tem acesso a
   * `onRequestImage`) — `apply` permanece síncrono: só remove `/query`
   * do bloco atual e entrega a âncora resultante a `onRequestImage`;
   * upload/diálogo/inserção acontecem inteiramente fora deste menu (ver
   * doc comment de `ArticleBodyImageFlow`). `SlashMenuItem`/sua
   * assinatura (`apply: (editor: LexicalEditor) => void`) não muda.
   */
  const items: SlashMenuItem[] = [
    ...SLASH_MENU_ITEMS,
    {
      id: 'image',
      label: 'Imagem',
      icon: ImageIcon,
      apply: (editorInstance) => {
        let capturedBlockKey: NodeKey | null = null;
        editorInstance.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return;
          }
          const blockElement = $getBlockElement(selection.anchor.getNode());
          if (!blockElement) {
            return;
          }
          blockElement.clear();
          capturedBlockKey = blockElement.getKey();
        });
        if (capturedBlockKey) {
          onRequestImage({ mode: 'replace-empty', blockKey: capturedBlockKey });
        }
      },
    },
    {
      id: 'product-block',
      label: 'Bloco Produto-Oferta',
      icon: Package,
      disabledReason:
        overallStatus === 'unavailable' ? 'salve o Artigo antes de inserir um bloco de Produto.' : undefined,
      apply: (editorInstance) => {
        let capturedBlockKey: NodeKey | null = null;
        editorInstance.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return;
          }
          const blockElement = $getBlockElement(selection.anchor.getNode());
          if (!blockElement) {
            return;
          }
          blockElement.clear();
          capturedBlockKey = blockElement.getKey();
        });
        if (capturedBlockKey) {
          onRequestProductBlock({ mode: 'replace-empty', blockKey: capturedBlockKey });
        }
      },
    },
  ];

  const results = items.filter((item) => matchesSlashQuery(item.label, query));

  // Ajuste de estado em resposta a mudança de `query`/`isOpen` — feito
  // durante a própria renderização (padrão documentado do React,
  // https://react.dev/learn/you-might-not-need-an-effect), mesmo critério
  // já usado em `command-palette.tsx` para o reset de sessão — não dentro
  // de um `useEffect`, que disparava `react-hooks/set-state-in-effect`
  // (chamada incondicional de `setActiveIndex` a cada mudança de
  // dependência, sem gate nenhum).
  const [resetSnapshot, setResetSnapshot] = useState({ query, isOpen });
  if (resetSnapshot.query !== query || resetSnapshot.isOpen !== isOpen) {
    setResetSnapshot({ query, isOpen });
    setActiveIndex(0);
  }

  // Refs "sempre atuais" para os comandos de teclado abaixo (registrados
  // uma única vez, sem precisar reagir a toda renderização). Escritas em
  // `ref.current` só dentro de um efeito (nunca durante a renderização —
  // proibido por `react-hooks/refs` no React 19); um único efeito sem
  // array de dependências roda após toda renderização, garantindo que os
  // refs nunca fiquem desatualizados quando o teclado for usado.
  const isOpenRef = useRef(isOpen);
  const resultsRef = useRef(results);
  const activeIndexRef = useRef(activeIndex);
  // "Sempre atual" também para `selectResult` (recriada a cada
  // renderização) — o efeito de comandos de teclado abaixo roda uma única
  // vez (deps: [editor]) e precisa chamar sempre a versão mais recente,
  // nunca uma capturada na primeira renderização.
  const selectResultRef = useRef(selectResult);
  useEffect(() => {
    isOpenRef.current = isOpen;
    resultsRef.current = results;
    activeIndexRef.current = activeIndex;
    selectResultRef.current = selectResult;
  });

  // Detecta "/query" do início ao cursor no bloco atual — ver doc comment
  // do arquivo para o racional completo (inclusive por que não dispara no
  // meio de uma frase).
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      if (disabled) {
        setIsOpen(false);
        return;
      }
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          setIsOpen(false);
          return;
        }
        const blockElement = $getBlockElement(selection.anchor.getNode());
        if (!blockElement) {
          setIsOpen(false);
          return;
        }
        const blockText = blockElement.getTextContent();
        const match = /^\/(\S*)$/.exec(blockText);
        if (match && selection.anchor.offset === blockText.length) {
          setQuery(match[1]);
          setIsOpen(true);
        } else {
          setIsOpen(false);
        }
      });
    });
  }, [editor, disabled]);

  // Único ponto de confirmação de um item — usado tanto pelo clique do
  // mouse (`onClick`, abaixo) quanto pelos comandos de teclado Enter/Tab
  // (efeito logo abaixo). Item com `disabledReason` nunca é aplicado nem
  // fecha o menu, por NENHUM dos dois caminhos — antes desta correção, os
  // handlers de teclado chamavam `item.apply(editor)` diretamente, sem
  // checar `disabledReason`, permitindo confirmar por teclado um item que o
  // clique já recusava (regressão silenciosa do critério "não pode ser
  // confirmado" para o item "Bloco Produto-Oferta" indisponível).
  function selectResult(item: SlashMenuItem | undefined) {
    if (!item || item.disabledReason) {
      return;
    }
    item.apply(editor);
    setIsOpen(false);
  }

  // Intercepta navegação/confirmação/fechamento só enquanto o menu está
  // aberto — prioridade alta para agir antes do comportamento padrão do
  // Lexical (nova linha no Enter, movimento normal de seleção nas setas).
  // Lê `isOpenRef`/`resultsRef`/`activeIndexRef` (identidade estável de
  // `ref`) e chama só os setters de `useState` (identidade estável,
  // garantida pelo React) diretamente — nunca as funções de escopo do
  // componente (recriadas a cada renderização) — por isso a dependência
  // real deste efeito é só `editor`, sem precisar de `eslint-disable`
  // para `react-hooks/exhaustive-deps`.
  useEffect(() => {
    const unregisterDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        if (!isOpenRef.current) {
          return false;
        }
        event?.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, Math.max(resultsRef.current.length - 1, 0)));
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    const unregisterUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        if (!isOpenRef.current) {
          return false;
        }
        event?.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!isOpenRef.current) {
          return false;
        }
        event?.preventDefault();
        selectResultRef.current(resultsRef.current[activeIndexRef.current]);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    const unregisterTab = editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        if (!isOpenRef.current) {
          return false;
        }
        event?.preventDefault();
        selectResultRef.current(resultsRef.current[activeIndexRef.current]);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        if (!isOpenRef.current) {
          return false;
        }
        setIsOpen(false);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
    return () => {
      unregisterDown();
      unregisterUp();
      unregisterEnter();
      unregisterTab();
      unregisterEscape();
    };
  }, [editor]);

  const isVisible = !disabled && isOpen;
  const activeItem = results[activeIndex];
  const listboxId = `${baseId}-listbox`;
  const emptyOptionId = `${baseId}-option-empty`;
  const activeDescendantId = results.length > 0 ? (activeItem ? `${baseId}-option-${activeItem.id}` : undefined) : emptyOptionId;
  const liveMessage = !isVisible
    ? ''
    : results.length > 0
      ? activeItem?.disabledReason
        ? `${activeItem.label}, indisponível: ${activeItem.disabledReason} Opção ${activeIndex + 1} de ${results.length}.`
        : `${activeItem?.label ?? ''} selecionado, opção ${activeIndex + 1} de ${results.length}.`
      : 'Nenhum resultado encontrado.';

  // Vínculo ARIA de combobox entre o `contentEditable` e o popup
  // `listbox` — ver doc comment do arquivo para o racional completo.
  // Aplicado imperativamente no elemento raiz do editor (assim como o
  // próprio `contentEditable` é gerenciado pelo Lexical fora da árvore
  // React deste componente) e sempre desfeito ao fechar/desmontar, para
  // nunca deixar o editor apontando para um `listbox`/opção que não
  // existe mais.
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) {
      return;
    }
    if (!isVisible) {
      root.removeAttribute('aria-autocomplete');
      root.removeAttribute('aria-controls');
      root.removeAttribute('aria-activedescendant');
      return;
    }
    root.setAttribute('aria-autocomplete', 'list');
    root.setAttribute('aria-controls', listboxId);
    if (activeDescendantId) {
      root.setAttribute('aria-activedescendant', activeDescendantId);
    } else {
      root.removeAttribute('aria-activedescendant');
    }
    return () => {
      root.removeAttribute('aria-autocomplete');
      root.removeAttribute('aria-controls');
      root.removeAttribute('aria-activedescendant');
    };
  }, [editor, isVisible, listboxId, activeDescendantId]);

  // UXE-022 (Addendum 7) — posicionamento do popover: ancora no caret
  // (`getCaretRect()`), com fallback para o canto do editor quando o caret
  // não é mensurável (jsdom). Depois de renderizado, mede o card real
  // (`menuRef`) e aplica collision handling: nunca ultrapassa a viewport
  // horizontalmente (clamp) e abre acima do caret quando falta espaço
  // abaixo (flip) — sem biblioteca nova. `positionTick` força recomputar em
  // scroll/resize (efeito logo abaixo); `query`/`results.length` cobrem
  // mudanças de texto/filtro que alteram a posição do caret ou a altura do
  // card.
  useLayoutEffect(() => {
    if (!isVisible) {
      setPosition(null);
      return;
    }
    const GAP = 4;
    const VIEWPORT_MARGIN = 8;
    const caretRect = getCaretRect();
    const anchorRect = caretRect ?? editor.getRootElement()?.getBoundingClientRect() ?? null;
    const anchorTop = anchorRect ? anchorRect.bottom : 0;
    const anchorCaretTop = anchorRect ? anchorRect.top : 0;
    const anchorLeft = anchorRect ? anchorRect.left : 0;

    const menuEl = menuRef.current;
    const menuWidth = menuEl?.offsetWidth ?? 0;
    const menuHeight = menuEl?.offsetHeight ?? 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = anchorLeft;
    if (left + menuWidth > viewportWidth - VIEWPORT_MARGIN) {
      left = viewportWidth - menuWidth - VIEWPORT_MARGIN;
    }
    if (left < VIEWPORT_MARGIN) {
      left = VIEWPORT_MARGIN;
    }

    let top = anchorTop + GAP;
    const fitsBelow = top + menuHeight <= viewportHeight - VIEWPORT_MARGIN;
    if (!fitsBelow) {
      const flippedTop = anchorCaretTop - menuHeight - GAP;
      top = flippedTop >= VIEWPORT_MARGIN ? flippedTop : VIEWPORT_MARGIN;
    }

    setPosition({ top, left });
  }, [editor, isVisible, query, results.length, positionTick]);

  // UXE-022 (Addendum 7) — reposiciona em scroll (capture: também pega
  // containers internos com scroll, não só a janela) e resize enquanto o
  // popover está aberto. Gap pré-existente no bloco estático anterior
  // (nunca precisava reposicionar) — comportamento novo, necessário para um
  // popover flutuante.
  useEffect(() => {
    if (!isVisible) {
      return;
    }
    function handleReposition() {
      setPositionTick((tick) => tick + 1);
    }
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [isVisible]);

  // UXE-022 (Addendum 7) — fecha ao clicar fora: gap pré-existente no bloco
  // estático anterior (perder foco não fechava o menu de forma confiável,
  // baixo impacto porque o bloco ficava sempre abaixo do editor; passa a
  // importar mais com um popover flutuante, que pode ficar sobre outros
  // elementos). `pointerdown` (não `blur`) porque o foco do DOM nunca deve
  // sair do `contentEditable` — ignora eventos originados dentro do próprio
  // popover ou do editor.
  useEffect(() => {
    if (!isVisible) {
      return;
    }
    function handlePointerDownOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (menuRef.current?.contains(target)) {
        return;
      }
      if (editor.getRootElement()?.contains(target)) {
        return;
      }
      setIsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [isVisible, editor]);

  return (
    <>
      {/*
        Região viva persistente (nunca desmontada) — canal complementar à
        relação de combobox aplicada pelo efeito acima (ver doc comment do
        arquivo). Precisa continuar montada mesmo com o menu fechado para
        que mudanças de texto sejam percebidas de forma confiável por
        leitores de tela.
      */}
      <div role="status" className={styles.srOnly}>
        {liveMessage}
      </div>
      {isVisible &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.slashMenu}
            style={{ position: 'fixed', top: position?.top ?? 0, left: position?.left ?? 0 }}
          >
            <ul id={listboxId} role="listbox" aria-label="Inserir bloco" className={styles.slashMenuList}>
              {results.length > 0 ? (
                results.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <li
                      key={item.id}
                      id={`${baseId}-option-${item.id}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      aria-disabled={item.disabledReason ? true : undefined}
                      className={index === activeIndex ? styles.slashMenuOptionActive : styles.slashMenuOption}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectResult(item)}
                    >
                      <span className={styles.slashMenuOptionIcon}>
                        <Icon aria-hidden="true" size={SLASH_MENU_ICON_SIZE} strokeWidth={SLASH_MENU_ICON_STROKE} />
                      </span>
                      {item.label}
                      {item.disabledReason && (
                        <span className={styles.slashMenuOptionDisabledReason}> — {item.disabledReason}</span>
                      )}
                    </li>
                  );
                })
              ) : (
                <li id={emptyOptionId} role="option" aria-disabled={true} aria-selected={false} className={styles.slashMenuEmpty}>
                  Nenhum resultado encontrado
                </li>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
