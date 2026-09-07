'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  BOLD_STAR,
  HEADING,
  ITALIC_STAR,
  LINK,
  ORDERED_LIST,
  QUOTE,
  UNORDERED_LIST,
} from '@lexical/markdown';
import { $createParagraphNode, RootNode, type EditorState } from 'lexical';
import { PRODUCT_BLOCK } from './product-block/transformer';
import { ProductBlockNode } from './product-block/node';
import { IMAGE } from './article-body-image/transformer';
import { ImageNode } from './article-body-image/node';
import { ArticleBodyToolbar } from './article-body-toolbar';
import { ArticleBodySlashMenu } from './article-body-slash-menu';
import { ArticleBodyImageFlow, type ArticleBodyImageFlowHandle, type ImageInsertionAnchor } from './article-body-image-flow';
import {
  ArticleBodyProductFlow,
  type ArticleBodyProductFlowHandle,
  type ProductBlockInsertionAnchor,
} from './article-body-product-flow';
import styles from './article-form.module.css';

/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-editor.tsx
 *
 * UXE-006 — Integração base do Lexical no Admin.
 *
 * Substitui o `<textarea id="article-body">` de `ArticleForm` (decisão
 * fechada na ADM-009) pelo editor Lexical básico aprovado no desenho desta
 * tarefa. `ArticleForm` continua dono do estado (`useState<string>`) —
 * este componente é "burro": recebe `initialValue` (só lido na montagem,
 * nunca reimportado a cada re-render do pai) e chama `onChange(markdown)`
 * a cada edição real do usuário, nunca na montagem/import inicial.
 *
 * Escopo: transformers Markdown padrão do editor base (heading, citação,
 * lista ordenada/não ordenada, link, negrito, itálico) + o transformer
 * customizado `PRODUCT_BLOCK` (`:::product`, UXE-003/UXE-004), exigido
 * explicitamente pela UXE-006 e pelo Editorial Serialization Contract §8.
 * Sem `CODE`/`INLINE_CODE` — nenhum dos 3 `bodyMdx` reais persistidos
 * (`spikes/lexical-editorial/corpus/persisted-current/`) contém código
 * inline ou bloco cercado.
 *
 * UXE-007 — Toolbar e menu de comando `/` (`ArticleBodyToolbar`,
 * `ArticleBodySlashMenu`, ambos locais a este diretório): montados como
 * plugins-filhos do mesmo `LexicalComposer`, cobrindo só as formatações já
 * suportadas pelo editor base acima (negrito, itálico, título H1-H3,
 * citação, lista, link). Nenhum `TRANSFORMERS`/node registrado aqui foi
 * alterado por essa tarefa.
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade: adiciona o transformer/node `IMAGE`/`ImageNode`
 * (`./article-body-image/`) e monta `ArticleBodyImageFlow`
 * (`./article-body-image-flow.tsx`) — fluxo único de upload+diálogo,
 * compartilhado por `ArticleBodyToolbar` e `ArticleBodySlashMenu` via o
 * callback síncrono `onRequestImage`, nunca duplicado entre as duas.
 * `isImageFlowActive` (estado local deste componente) bloqueia o editor
 * durante todo o fluxo — ver doc comment de `ArticleBodyImageFlow` para o
 * racional completo.
 *
 * Fora de escopo (não implementado aqui): autosave é UXE-008 (já
 * implementada em tarefa anterior, sem relação com esta doc); edição de
 * imagem (crop/resize, fora do escopo da UXE-010).
 *
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição. Mesmo padrão de
 * UXE-010: `ArticleBodyProductFlow` (`./article-body-product-flow.tsx`) é
 * o único fluxo de inserção/edição do `ProductBlockNode`
 * (`./product-block/node.ts`, migrado para `DecoratorBlockNode` nesta
 * tarefa), acionado pelo menu `/` (inserção, via `onRequestProductBlock`)
 * e pelo botão "Editar bloco de Produto vinculado" do próprio decorator
 * (edição, via `OPEN_PRODUCT_BLOCK_EDIT_COMMAND`,
 * `./product-block/edit-command.ts` — registrado pelo próprio
 * `ArticleBodyProductFlow`, nenhum wiring extra necessário aqui além de
 * montar o componente). `isProductFlowActive` soma-se a
 * `isImageFlowActive` em `effectiveDisabled`, mesmo mecanismo, nunca
 * concorrente entre si (só um fluxo por vez pode estar ativo — cada um
 * desabilita o próprio item que o aciona enquanto ativo, via
 * `effectiveDisabled` já propagado à toolbar/menu).
 *
 * `RootNeverEmptyPlugin` (novo nesta tarefa) — garante, via
 * `editor.registerNodeTransform(RootNode, ...)`, que `RootNode` nunca
 * commite com zero filhos depois de Delete/Backspace remover o único/
 * último bloco de nível superior do documento (ex.: o único
 * `ProductBlockNode`) — Delete/Backspace sobre uma `NodeSelection` já é
 * tratado genericamente por `registerRichText` (`@lexical/rich-text`),
 * nenhuma reimplementação própria. Um node transform roda DENTRO do mesmo
 * `editor.update()` que fez a remoção, antes do commit/reconciliação e
 * antes de qualquer `registerUpdateListener`/`OnChangePlugin` — nunca um
 * `registerUpdateListener` reparando depois de um estado com Root vazio já
 * ter sido commitado (o que poderia propagar `bodyMdx=""` para
 * `ChangeTrackerPlugin`/autosave antes da reparação).
 */

const TRANSFORMERS = [HEADING, QUOTE, UNORDERED_LIST, ORDERED_LIST, LINK, BOLD_STAR, ITALIC_STAR, PRODUCT_BLOCK, IMAGE];

/**
 * Funções em escopo de módulo (não recriadas a cada renderização) usadas
 * por `useSyncExternalStore` na guarda client-only/SSR-safe de
 * `ArticleBodyEditor` (ver comentário completo no próprio componente).
 * Não existe nenhuma "loja" externa real por trás disso — apenas o par
 * de snapshots servidor/cliente que `useSyncExternalStore` já resolve
 * corretamente durante a hidratação — por isso `subscribeNever` nunca
 * notifica nenhum listener.
 */
function subscribeNever(): () => void {
  return () => {};
}

function getClientMountedSnapshot(): boolean {
  return true;
}

function getServerMountedSnapshot(): boolean {
  return false;
}

interface ArticleBodyEditorProps {
  id: string;
  labelId: string;
  /**
   * UXE-010 — necessário para montar a URL do endpoint de upload
   * (`/admin/sites/:siteSlug/uploads/images`), consumido por
   * `ArticleBodyImageFlow`. `ArticleBodyEditor` continua "burro" quanto
   * ao restante (conteúdo/mudança de `bodyMdx`) — este é o único dado
   * novo que precisa atravessar este componente para o fluxo de imagem.
   */
  siteSlug: string;
  initialValue: string;
  onChange: (markdown: string) => void;
  disabled?: boolean;
}

/**
 * Mantém `editor.setEditable()` sincronizado com a prop `disabled` (mesmo
 * papel de `disabled={isSubmitting}` já usado nos demais campos de
 * `ArticleForm`) — `initialConfig.editable` só vale na criação do editor,
 * não reage a mudanças posteriores.
 */
function EditableSyncPlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return null;
}

/**
 * UXE-011 — ver racional completo no doc comment do topo do arquivo
 * ("RootNeverEmptyPlugin"). Registrado uma única vez por instância do
 * editor (efeito com `[editor]` como única dependência) — o transform em
 * si é idempotente (só age quando `getChildrenSize() === 0`), então
 * múltiplas remoções sucessivas do único bloco continuam seguras.
 */
function RootNeverEmptyPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(RootNode, (root) => {
      if (root.getChildrenSize() === 0) {
        const paragraph = $createParagraphNode();
        root.append(paragraph);
        paragraph.select();
      }
    });
  }, [editor]);

  return null;
}

/**
 * Serializa para Markdown e propaga via `onChange` — mas só quando o
 * conteúdo exportado realmente diverge do valor inicial importado
 * (`baselineMarkdownRef`), nunca por descartar uma notificação específica
 * pela sua posição ordinal (`OnChangePlugin` pode disparar zero, uma ou
 * mais notificações "espúrias" — sem mudança de conteúdo — durante a
 * montagem/import inicial e o commit da raiz DOM; a quantidade exata não é
 * uma garantia documentada da versão instalada de `@lexical/react`, então
 * o código não pode depender dela).
 *
 * `ignoreSelectionChange` (correção desta rodada, UXE-010): `OnChangePlugin`
 * usa `false` como padrão — uma notificação cuja única mudança é a seleção
 * (nenhum nó de conteúdo ficou "dirty") chega normalmente a `handleChange`.
 * Isso nunca importava antes desta tarefa: toda notificação espúria
 * observada até então acontecia ANTES da primeira divergência real do
 * baseline, e a comparação abaixo (`exportedMarkdown ===
 * baselineMarkdownRef.current`) já a descartava. UXE-010 introduziu o
 * primeiro fluxo desta base de código que tira o foco do editor DEPOIS de
 * uma edição real já ter ocorrido e o devolve mais tarde (seletor de
 * arquivo + diálogo + upload) — uma notificação de seleção pura nesse
 * momento (ex.: `editor.getRootElement()?.focus()` ao cancelar/restaurar em
 * `ArticleBodyImageFlow`) chega DEPOIS que `hasDivergedFromBaselineRef.current`
 * já é `true`, e a partir daí a comparação com o baseline não filtra mais
 * nada — resultando numa chamada de `onChange` espúria, com o mesmo
 * Markdown de antes, sem nenhuma edição nova ter ocorrido. `baselineMarkdownRef`
 * só resolve a janela "antes da primeira divergência"; nunca teve como
 * resolver uma notificação de seleção pura ocorrida depois dela.
 * `ignoreSelectionChange` resolve isso na origem, para as duas janelas: uma
 * notificação sem nenhum nó de conteúdo alterado nunca chega a
 * `handleChange`, então nunca é uma "edição real" candidata, seja antes ou
 * depois da primeira divergência — consistente com o propósito de
 * `onChange` (propagar `bodyMdx` para autosave), que nunca deveria reagir a
 * mero movimento de cursor/foco.
 *
 * `baselineMarkdownRef` é calculado uma única vez, de forma síncrona,
 * dentro da própria função `editorState` de `LexicalComposer` (ver abaixo)
 * — ou seja, na mesma atualização que importa `initialValue`, antes de
 * `ChangeTrackerPlugin` sequer montar e registrar seu listener. Isso
 * garante que o baseline já existe antes de qualquer notificação possível
 * do `OnChangePlugin`, sem depender de quantas notificações ocorrem nem em
 * que ordem.
 *
 * Enquanto o Markdown exportado for igual ao baseline, nenhuma notificação
 * é uma edição real — `onChange` não é chamado (cobre montagem/import e
 * qualquer commit inicial da raiz DOM, sejam quantos forem). Assim que o
 * Markdown exportado divergir do baseline pela primeira vez, essa
 * notificação É a primeira edição real do usuário: `onChange` é chamado
 * com o Markdown atualizado e `hasDivergedFromBaselineRef` passa a `true`
 * — a partir daí, toda notificação seguinte chama `onChange` normalmente
 * (sem voltar a comparar com o baseline), incluindo o caso de o usuário
 * desfazer a edição e retornar ao conteúdo original.
 */
function ChangeTrackerPlugin({
  onChange,
  baselineMarkdownRef,
}: {
  onChange: (markdown: string) => void;
  baselineMarkdownRef: React.RefObject<string>;
}) {
  const hasDivergedFromBaselineRef = useRef(false);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const exportedMarkdown = $convertToMarkdownString(TRANSFORMERS);

        if (!hasDivergedFromBaselineRef.current) {
          if (exportedMarkdown === baselineMarkdownRef.current) {
            // Notificação sem mudança de conteúdo em relação ao valor
            // inicial importado (montagem, import, commit de raiz DOM,
            // seleção sem edição, etc.) — não é uma edição real.
            return;
          }
          hasDivergedFromBaselineRef.current = true;
        }

        onChange(exportedMarkdown);
      });
    },
    [onChange, baselineMarkdownRef],
  );

  return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />;
}

export function ArticleBodyEditor({ id, labelId, siteSlug, initialValue, onChange, disabled = false }: ArticleBodyEditorProps) {
  // UXE-010 — `isImageFlowActive` cobre exatamente a janela entre acionar
  // "Imagem" (toolbar ou menu `/`) e o fluxo terminar (cancelamento,
  // sucesso ou falha) — ver doc comment completo em
  // `article-body-image-flow.tsx`. Somado a `disabled` (nunca
  // substituído por ele) via `effectiveDisabled` abaixo: o editor fica
  // não-editável tanto durante o submit do formulário quanto durante o
  // fluxo de imagem, sem os dois mecanismos colidirem.
  const [isImageFlowActive, setIsImageFlowActive] = useState(false);
  const imageFlowRef = useRef<ArticleBodyImageFlowHandle>(null);
  const handleRequestImage = useCallback((anchor: ImageInsertionAnchor) => {
    imageFlowRef.current?.requestImage(anchor);
  }, []);
  // UXE-011 — mesmo mecanismo de `isImageFlowActive`/`imageFlowRef`, um
  // fluxo independente (nenhum dos dois compartilha estado): só um dos
  // dois pode estar ativo por vez na prática (cada item que aciona um
  // fluxo já está desabilitado por `effectiveDisabled` enquanto o outro
  // está ativo), mas a soma abaixo cobre os dois sem suposição extra.
  const [isProductFlowActive, setIsProductFlowActive] = useState(false);
  const productFlowRef = useRef<ArticleBodyProductFlowHandle>(null);
  const handleRequestProductBlock = useCallback((anchor: ProductBlockInsertionAnchor) => {
    productFlowRef.current?.requestInsert(anchor);
  }, []);
  const effectiveDisabled = disabled || isImageFlowActive || isProductFlowActive;

  // Guarda client-only/SSR-safe: o Next.js ainda faz uma passada de
  // renderização no servidor para Client Components — `LexicalComposer`/
  // `ContentEditable` só montam depois da hidratação, evitando qualquer
  // acesso a `document`/`window` antes disso (mesmo risco de
  // SSR/hidratação já registrado no backlog para esta tarefa).
  //
  // `useSyncExternalStore` (em vez de `useState` + `useEffect(() =>
  // setState(...), [])`) evita `setState` síncrono dentro de um effect
  // (proibido por `react-hooks/set-state-in-effect`): não existe nenhuma
  // "loja" externa real para assinar aqui — `subscribeNever` nunca
  // notifica —, então o valor só muda entre o snapshot do servidor
  // (`getServerMountedSnapshot`, sempre `false`) e o snapshot do cliente
  // (`getClientMountedSnapshot`, sempre `true`); é o próprio React quem
  // reconcilia essa troca após a hidratação, sem nenhum `setState`
  // manual. Mesma semântica anterior: primeira renderização (servidor e
  // primeira passada do cliente) é `false`; a partir da hidratação, `true`.
  const isMounted = useSyncExternalStore(subscribeNever, getClientMountedSnapshot, getServerMountedSnapshot);

  // Preenchido de forma síncrona dentro de `initialConfig.editorState`
  // (abaixo), antes de qualquer plugin montar — ver o racional completo no
  // comentário de `ChangeTrackerPlugin`. `useRef` (não `useState`): este
  // valor nunca deve causar re-render, é lido apenas por dentro de um
  // callback do Lexical.
  const baselineMarkdownRef = useRef<string>('');

  // `initialConfig` só é lido por `LexicalComposer` na criação do editor
  // (mudanças posteriores no objeto são ignoradas — mesma premissa já
  // documentada para `editable`/`EditableSyncPlugin` acima). Inicialização
  // preguiçosa de estado via `useState(() => ...)` (não `useRef` — acessar/
  // atribuir `ref.current` durante a própria renderização é proibido por
  // `react-hooks/refs` no React 19; não `useMemo` — um array de
  // dependências vazio ficaria, por definição, "desatualizado" em relação
  // a `disabled`/`initialValue`, que são lidos só aqui e nunca mais,
  // gerando o warning `useMemo has missing dependencies`). Nenhum setter é
  // usado (nem effect): o estado existe só para manter esse snapshot
  // estável durante toda a vida desta instância do editor — a função
  // passada a `useState` roda uma única vez, na primeira renderização, e
  // seu resultado nunca é recalculado nem descartado por reconciliação
  // (diferente de `useMemo`, que é só uma otimização, não uma garantia).
  const [initialConfig] = useState<InitialConfigType>(() => ({
    namespace: 'article-body-editor',
    editable: !disabled,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, ProductBlockNode, ImageNode],
    onError: (error) => {
      throw error;
    },
    // Import inicial do `bodyMdx` existente — roda uma única vez, na
    // criação do editor, dentro de um `editor.update()` interno do
    // Lexical. Na mesma passada, calcula e grava o baseline usado por
    // `ChangeTrackerPlugin` para distinguir "import" de "edição real" —
    // ver o racional completo no comentário de `ChangeTrackerPlugin`.
    editorState: () => {
      $convertFromMarkdownString(initialValue, TRANSFORMERS);
      baselineMarkdownRef.current = $convertToMarkdownString(TRANSFORMERS);
    },
  }));

  if (!isMounted) {
    return <div id={id} className={styles.bodyField} aria-hidden="true" />;
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <ArticleBodyToolbar disabled={effectiveDisabled} onRequestImage={handleRequestImage} />
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            id={id}
            className={styles.bodyField}
            role="textbox"
            aria-multiline="true"
            aria-labelledby={labelId}
          />
        }
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <ArticleBodySlashMenu
        disabled={effectiveDisabled}
        onRequestImage={handleRequestImage}
        onRequestProductBlock={handleRequestProductBlock}
      />
      <ArticleBodyImageFlow ref={imageFlowRef} siteSlug={siteSlug} onActiveChange={setIsImageFlowActive} />
      <ArticleBodyProductFlow ref={productFlowRef} onActiveChange={setIsProductFlowActive} />
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
      <EditableSyncPlugin disabled={effectiveDisabled} />
      <RootNeverEmptyPlugin />
      <ChangeTrackerPlugin onChange={onChange} baselineMarkdownRef={baselineMarkdownRef} />
    </LexicalComposer>
  );
}
