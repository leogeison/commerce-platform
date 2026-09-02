'use client';

import { useEffect, useId, useRef, useState } from 'react';
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
} from 'lexical';
import { $createHeadingNode, type HeadingTagType } from '@lexical/rich-text';
import { $createListItemNode, $createListNode } from '@lexical/list';
import { $getBlockElement } from './article-body-block-utils';
import styles from './article-form.module.css';

/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-slash-menu.tsx
 *
 * UXE-007 — Toolbar e menu de comando `/`.
 *
 * Escopo nesta tarefa: só os itens cuja capacidade já existe hoje no editor
 * base (título H1-H3, lista não ordenada/ordenada). "Imagem" e "bloco
 * Produto-Oferta" ficam deliberadamente ausentes do menu — decisão fechada
 * com o usuário: Imagem nasce na UXE-010 (upload real + decisão de
 * alt-text/decorativo — nenhuma dessas peças é antecipada aqui) e o bloco
 * Produto-Oferta nasce na UXE-011 (seleção/inserção/edição funcional sobre
 * `ArticleProduct`). Um item ausente nunca é um item quebrado.
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
 * Não é um popup flutuante ancorado ao cursor: renderiza como um bloco
 * estático logo abaixo da área editável. Medir a posição real do cursor
 * (`getBoundingClientRect()`) é frágil em jsdom (retorna zero) e nenhum
 * critério de aceite desta tarefa exige ancoragem visual exata — só que o
 * menu seja operável por mouse/teclado no padrão combobox acessível.
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

const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  { id: 'heading-1', label: 'Título 1', apply: (editor) => applyHeadingFromEmptyBlock(editor, 'h1') },
  { id: 'heading-2', label: 'Título 2', apply: (editor) => applyHeadingFromEmptyBlock(editor, 'h2') },
  { id: 'heading-3', label: 'Título 3', apply: (editor) => applyHeadingFromEmptyBlock(editor, 'h3') },
  { id: 'list-bullet', label: 'Lista', apply: (editor) => applyListFromEmptyBlock(editor, 'bullet') },
  { id: 'list-number', label: 'Lista numerada', apply: (editor) => applyListFromEmptyBlock(editor, 'number') },
];

export function ArticleBodySlashMenu({ disabled = false }: { disabled?: boolean }) {
  const [editor] = useLexicalComposerContext();
  const baseId = useId();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const results = SLASH_MENU_ITEMS.filter((item) => matchesSlashQuery(item.label, query));

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
  useEffect(() => {
    isOpenRef.current = isOpen;
    resultsRef.current = results;
    activeIndexRef.current = activeIndex;
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

  function selectResult(item: SlashMenuItem | undefined) {
    if (!item) {
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
        const item = resultsRef.current[activeIndexRef.current];
        if (item) {
          item.apply(editor);
        }
        setIsOpen(false);
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
        const item = resultsRef.current[activeIndexRef.current];
        if (item) {
          item.apply(editor);
        }
        setIsOpen(false);
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
      ? `${activeItem?.label ?? ''} selecionado, opção ${activeIndex + 1} de ${results.length}.`
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
      {isVisible && (
        <div className={styles.slashMenu}>
          <ul id={listboxId} role="listbox" aria-label="Inserir bloco" className={styles.slashMenuList}>
            {results.length > 0 ? (
              results.map((item, index) => (
                <li
                  key={item.id}
                  id={`${baseId}-option-${item.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? styles.slashMenuOptionActive : styles.slashMenuOption}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectResult(item)}
                >
                  {item.label}
                </li>
              ))
            ) : (
              <li id={emptyOptionId} role="option" aria-disabled={true} aria-selected={false} className={styles.slashMenuEmpty}>
                Nenhum resultado encontrado
              </li>
            )}
          </ul>
        </div>
      )}
    </>
  );
}
