'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Loader2 } from 'lucide-react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createNodeSelection,
  $createParagraphNode,
  $getNodeByKey,
  $isElementNode,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  type NodeKey,
  type RangeSelection,
} from 'lexical';
import { $createProductBlockNode, $isProductBlockNode } from './product-block/node';
import { OPEN_PRODUCT_BLOCK_EDIT_COMMAND } from './product-block/edit-command';
import { useProductLookup } from './product-lookup-context';
import styles from './article-form.module.css';

/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-product-flow.tsx
 *
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição.
 *
 * Fluxo único de inserção/edição do `ProductBlockNode`, mesmo espírito de
 * `ArticleBodyImageFlow` (`UXE-010`): um único componente, montado uma vez
 * dentro do `LexicalComposer`, concentra toda a interação — nem o menu `/`
 * nem o decorator do node implementam nada além de acionar este fluxo.
 *
 * Diferenças deliberadas em relação a `ArticleBodyImageFlow` (nunca
 * refatoradas para um componente genérico compartilhado — cada fluxo
 * continua independente, mesmo critério já usado neste código-base para
 * `ArticleProductsSection`/`OfferSection` e outros pares análogos):
 * - Sem upload/rede própria: a lista de Produtos selecionáveis já está
 *   inteiramente carregada em `ProductLookupContext` (`useProductLookup`,
 *   `linkedProducts`) — só Produtos JÁ vinculados ao Artigo via
 *   `ArticleProduct` (escopo explícito da UXE-011; vincular um Produto
 *   novo continua sendo `UXE-014`, painel lateral). Nenhum fetch parte
 *   deste componente.
 * - Dois modos, não um: `insert` (gatilho pelo menu `/`, mesma forma de
 *   âncora — `ProductBlockInsertionAnchor` — já usada por
 *   `ImageInsertionAnchor`, mas definida localmente aqui, sem import
 *   cruzado entre os dois fluxos) e `edit` (gatilho pelo botão "Editar
 *   bloco de Produto vinculado" do próprio decorator, via
 *   `OPEN_PRODUCT_BLOCK_EDIT_COMMAND` — `./product-block/edit-command`,
 *   módulo isolado para não criar import circular com `./product-block/node`).
 * - Nenhum passo assíncrono entre abrir o diálogo e confirmar: a inserção/
 *   edição em si é síncrona (`editor.update()`), diferente do upload de
 *   imagem — por isso não existe um estado `'uploading'`/`'error'` de
 *   rede aqui; a única "falha" possível é a fonte compartilhada não estar
 *   pronta (`overallStatus !== 'ready'`) ou não ter nenhum Produto
 *   vinculado, ambas tratadas como mensagem explicativa dentro do próprio
 *   diálogo (`Fechar`), nunca como um estado de erro genérico.
 *
 * Mesmo padrão de "último bloco" já validado em `ArticleBodyImageFlow`: ao
 * inserir como último bloco de nível superior, `productNode.selectNext()`
 * cairia no fallback do Lexical (`parent.select()` sobre o `RootNode`, sem
 * caret real) — por isso um `ParagraphNode` vazio é criado e selecionado
 * explicitamente sempre que não há próximo irmão.
 *
 * `onActiveChange` (mesma prop/contrato de `ArticleBodyImageFlow`) cobre a
 * janela entre abrir o diálogo e ele fechar (confirmar/cancelar) —
 * `article-body-editor.tsx` combina com `disabled` do mesmo jeito
 * (`effectiveDisabled`).
 */

export interface ProductBlockInsertionAnchor {
  mode: 'insert-after' | 'replace-empty';
  blockKey: NodeKey;
  restoreSelection?: RangeSelection;
}

export interface ArticleBodyProductFlowHandle {
  requestInsert: (anchor: ProductBlockInsertionAnchor) => void;
}

interface ArticleBodyProductFlowProps {
  onActiveChange: (active: boolean) => void;
}

type FlowState =
  | { status: 'idle' }
  | { status: 'picking'; mode: 'insert'; anchor: ProductBlockInsertionAnchor; selectedProductId: string }
  | { status: 'picking'; mode: 'edit'; nodeKey: NodeKey; selectedProductId: string };

const LOOKUP_LOADING_MESSAGE = 'Carregando Produtos vinculados...';
const LOOKUP_UNAVAILABLE_MESSAGE = 'Não foi possível carregar os Produtos vinculados a este Artigo.';
const NO_LINKED_PRODUCTS_MESSAGE =
  'Nenhum Produto vinculado a este Artigo. Vincule um Produto na seção "Produtos vinculados" antes de inserir o bloco.';

export const ArticleBodyProductFlow = forwardRef<ArticleBodyProductFlowHandle, ArticleBodyProductFlowProps>(
  function ArticleBodyProductFlow({ onActiveChange }, ref) {
    const [editor] = useLexicalComposerContext();
    const { linkedProducts, overallStatus } = useProductLookup();
    const [state, setState] = useState<FlowState>({ status: 'idle' });
    const dialogRef = useRef<HTMLDivElement>(null);
    const firstFieldRef = useRef<HTMLSelectElement | HTMLButtonElement>(null);

    useImperativeHandle(ref, () => ({
      requestInsert(anchor: ProductBlockInsertionAnchor) {
        editor.setEditable(false);
        onActiveChange(true);
        setState({ status: 'picking', mode: 'insert', anchor, selectedProductId: '' });
      },
    }));

    // "Editar bloco de Produto vinculado" (decorator do node) despacha
    // este comando com a `nodeKey` do bloco — a seleção inicial do
    // `<select>` é pré-preenchida com o `productId` atual do node QUANDO
    // ele ainda está entre os vinculados (`linkedProducts`); referência
    // órfã (Produto desvinculado enquanto o bloco existia) começa sem
    // seleção, nunca com um valor que o usuário não escolheu.
    useEffect(() => {
      return editor.registerCommand(
        OPEN_PRODUCT_BLOCK_EDIT_COMMAND,
        ({ nodeKey }) => {
          let currentProductId = '';
          editor.getEditorState().read(() => {
            const node = $getNodeByKey(nodeKey);
            if (node && $isProductBlockNode(node)) {
              currentProductId = node.getProductId();
            }
          });
          const selectedProductId = linkedProducts.some((product) => product.id === currentProductId)
            ? currentProductId
            : '';
          editor.setEditable(false);
          onActiveChange(true);
          setState({ status: 'picking', mode: 'edit', nodeKey, selectedProductId });
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      );
    }, [editor, linkedProducts, onActiveChange]);

    useEffect(() => {
      if (state.status === 'picking') {
        firstFieldRef.current?.focus();
      }
    }, [state.status]);

    function handleCancel() {
      if (state.status !== 'picking') {
        return;
      }
      editor.setEditable(true);
      if (state.mode === 'insert') {
        const { anchor } = state;
        editor.update(() => {
          if (anchor.mode === 'insert-after' && anchor.restoreSelection) {
            $setSelection(anchor.restoreSelection.clone());
            return;
          }
          const block = $getNodeByKey(anchor.blockKey);
          if (block && $isElementNode(block)) {
            block.selectStart();
          }
        });
      } else {
        const { nodeKey } = state;
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if (node) {
            const selection = $createNodeSelection();
            selection.add(nodeKey);
            $setSelection(selection);
          }
        });
      }
      editor.getRootElement()?.focus();
      onActiveChange(false);
      setState({ status: 'idle' });
    }

    function handleConfirm() {
      if (state.status !== 'picking' || !state.selectedProductId) {
        return;
      }
      const { selectedProductId } = state;

      if (state.mode === 'insert') {
        const { anchor } = state;
        editor.update(() => {
          const block = $getNodeByKey(anchor.blockKey);
          if (!block || !$isElementNode(block)) {
            return;
          }
          const productNode = $createProductBlockNode(selectedProductId);
          if (anchor.mode === 'replace-empty') {
            block.replace(productNode);
          } else {
            block.insertAfter(productNode);
          }

          // Mesmo bug/correção já validado em `ArticleBodyImageFlow`: um
          // `DecoratorBlockNode` como ÚLTIMO bloco de nível superior faz
          // `selectNext()` cair no fallback do Lexical (`parent.select()`
          // sobre o `RootNode`), sem caret real — só nesse caso um
          // parágrafo vazio é criado e selecionado explicitamente.
          if (productNode.getNextSibling() !== null) {
            productNode.selectNext();
          } else {
            const trailingParagraph = $createParagraphNode();
            productNode.insertAfter(trailingParagraph);
            trailingParagraph.select();
          }
        });
        editor.setEditable(true);
        onActiveChange(false);
        editor.getRootElement()?.focus();
        setState({ status: 'idle' });
        return;
      }

      const { nodeKey } = state;
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node && $isProductBlockNode(node)) {
          node.setProductId(selectedProductId);
        }
        const selection = $createNodeSelection();
        selection.add(nodeKey);
        $setSelection(selection);
      });
      editor.setEditable(true);
      onActiveChange(false);
      editor.getRootElement()?.focus();
      setState({ status: 'idle' });
    }

    function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)'),
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    if (state.status !== 'picking') {
      return null;
    }

    const heading =
      state.mode === 'edit' ? 'Editar bloco de Produto vinculado' : 'Inserir bloco de Produto vinculado';

    return (
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="article-body-product-dialog-heading"
        className={styles.productDialog}
        onKeyDown={handleDialogKeyDown}
      >
        <h2 id="article-body-product-dialog-heading" className={styles.productDialogHeading}>
          {heading}
        </h2>

        {overallStatus === 'loading' ? (
          <>
            <p role="status" className={styles.productDialogLoading}>
              <Loader2 aria-hidden="true" className={styles.productDialogLoadingIcon} />
              {LOOKUP_LOADING_MESSAGE}
            </p>
            <div className={styles.productDialogActions}>
              <button
                ref={(node) => {
                  firstFieldRef.current = node;
                }}
                type="button"
                onClick={handleCancel}
              >
                Fechar
              </button>
            </div>
          </>
        ) : overallStatus !== 'ready' ? (
          <>
            <p role="alert" className={styles.productDialogError}>
              {LOOKUP_UNAVAILABLE_MESSAGE}
            </p>
            <div className={styles.productDialogActions}>
              <button
                ref={(node) => {
                  firstFieldRef.current = node;
                }}
                type="button"
                onClick={handleCancel}
              >
                Fechar
              </button>
            </div>
          </>
        ) : linkedProducts.length === 0 ? (
          <>
            <p className={styles.productDialogEmpty}>{NO_LINKED_PRODUCTS_MESSAGE}</p>
            <div className={styles.productDialogActions}>
              <button
                ref={(node) => {
                  firstFieldRef.current = node;
                }}
                type="button"
                onClick={handleCancel}
              >
                Fechar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.productDialogField}>
              <label htmlFor="article-body-product-select">Produto vinculado</label>
              <select
                id="article-body-product-select"
                ref={(node) => {
                  firstFieldRef.current = node;
                }}
                value={state.selectedProductId}
                onChange={(event) => setState({ ...state, selectedProductId: event.target.value })}
              >
                <option value="">Selecione um Produto</option>
                {linkedProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                    {product.archivedAt ? ' (arquivado)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.productDialogActions}>
              <button type="button" onClick={handleConfirm} disabled={!state.selectedProductId}>
                {state.mode === 'edit' ? 'Salvar Produto' : 'Inserir bloco'}
              </button>
              <button type="button" onClick={handleCancel}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    );
  },
);
