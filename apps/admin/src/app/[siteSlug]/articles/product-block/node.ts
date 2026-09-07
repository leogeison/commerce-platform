/**
 * apps/admin/src/app/[siteSlug]/articles/product-block/node.ts
 *
 * UXE-006 — Integração base do Lexical no Admin (`ElementNode` original).
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição (MIGRAÇÃO para
 * `DecoratorBlockNode`, aprovada nesta tarefa).
 *
 * Por que migrar de `ElementNode` para `DecoratorBlockNode` (mesmo
 * racional já validado e em produção desde `UXE-010`/`ImageNode` — ver
 * `../article-body-image/node.ts`): um `ElementNode` de nível de bloco sem
 * filhos de texto aciona, na reconciliação do Lexical 0.49
 * (`LexicalReconciler.ts`), o mecanismo de "managed line break"
 * (`$isLastChildLineBreakOrDecorator` + `ElementDOMSlot.setManagedLineBreak`),
 * que insere um `<br data-lexical-managed-linebreak>` dentro do mesmo DOM
 * retornado por `createDOM()` — efeito colateral indesejado para um
 * embed atômico. `DecoratorBlockNode` nunca passa por esse caminho: seu
 * conteúdo é montado via `decorate()` (portal React, já ativo através do
 * `RichTextPlugin` montado em `article-body-editor.tsx`), nunca via
 * reconciliação de filhos Lexical — por isso o node não tem (nem nunca
 * teve) filhos.
 *
 * Seleção atômica por mouse E teclado: a navegação por teclado ao redor de
 * um `DecoratorBlockNode` (setas cruzando a fronteira do bloco) já produz
 * uma `NodeSelection` real por conta do próprio `@lexical/rich-text`/
 * núcleo do Lexical — nenhum código adicional foi necessário para isso
 * (mesma comprovação empírica já feita para `ImageNode` em `UXE-010`). Só
 * a seleção por CLIQUE precisa de wiring explícito abaixo
 * (`ProductBlockDecorator`): `useLexicalNodeSelection` + `CLICK_COMMAND`
 * em `COMMAND_PRIORITY_LOW` — prioridade necessária porque
 * `registerRichText` registra seu próprio `CLICK_COMMAND` em
 * `COMMAND_PRIORITY_EDITOR` (a mais baixa) que limpa qualquer
 * `NodeSelection` a cada clique; rodar em `COMMAND_PRIORITY_LOW` (acima da
 * de `EDITOR`) garante que a seleção deste bloco vença antes desse
 * comportamento padrão rodar. Delete/Backspace sobre uma `NodeSelection`
 * já é tratado genericamente por `registerRichText`
 * (`selection.deleteNodes()`) — nenhuma reimplementação própria aqui.
 *
 * `ref` do clique é o `<span>` do rótulo (texto resolvido do Produto),
 * nunca o `<button>` "Editar bloco de Produto vinculado" — clicar no
 * botão nunca deve, por si só, alternar a seleção do bloco (o botão tem
 * seu próprio `onClick`, independente de `NodeSelection`).
 *
 * "Editar bloco de Produto vinculado" — único botão tabbable do bloco,
 * sempre presente e sempre no fluxo normal de tabulação (nunca `disabled`
 * por causa de estado de carregamento/erro da resolução do Produto — só
 * fica `disabled` quando o editor inteiro está `!isEditable`, o mesmo
 * mecanismo que já desabilita o `contentEditable` durante
 * submit/qualquer outro fluxo ativo — `editor.registerEditableListener`,
 * sem precisar de uma prop `disabled` própria threading por todo o
 * editor). Ao ser acionado, despacha `OPEN_PRODUCT_BLOCK_EDIT_COMMAND`
 * (`./edit-command`, módulo isolado para não criar import circular com
 * `../article-body-product-flow`, que registra o handler real).
 *
 * Rótulo textual (`describeProductResolution`) nunca é um snapshot
 * persistido — sempre derivado, a cada renderização do decorator, de
 * `ProductLookupContext.resolveProduct(productId)` (`../product-lookup-context`,
 * UXE-011): único estado editorial de domínio continua sendo `productId`
 * (Contract §4), a resolução (nome/arquivado/não encontrado) é sempre
 * dinâmica, nunca embutida no node. Nenhum fetch parte deste decorator —
 * a fonte já foi buscada por `ProductLookupProvider`, montado acima do
 * editor inteiro.
 */

import { createElement, useEffect, useRef, useState, type JSX } from 'react';
import { DecoratorBlockNode } from '@lexical/react/LexicalDecoratorBlockNode';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import {
  $applyNodeReplacement,
  createState,
  $getState,
  $setState,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  getComposedEventTarget,
  type NodeKey,
} from 'lexical';
import { ProductBlockSyntaxError, parseProductBlockBody, serializeProductBlock } from './grammar';
import { OPEN_PRODUCT_BLOCK_EDIT_COMMAND } from './edit-command';
import { useProductLookup, type ProductResolution } from '../product-lookup-context';
import styles from '../article-form.module.css';

export const PRODUCT_BLOCK_NODE_TYPE = 'product-block';

const productIdState = createState('productId', {
  parse: (value: unknown): string => (typeof value === 'string' ? value : ''),
});

// Classe/atributo usados só para identificação no DOM/testes — o wrapper
// de `createDOM()` nunca carrega dado de domínio (isso é responsabilidade
// exclusiva de `decorate()`, que reage a mudança de `productId`/resolução
// via React; `createDOM()` roda uma única vez, na criação do node).
const DOM_CLASS_NAME = 'product-block-node';

function describeProductResolution(resolution: ProductResolution): string {
  switch (resolution.status) {
    case 'ready':
      return resolution.product.archivedAt ? `${resolution.product.name} (arquivado)` : resolution.product.name;
    case 'not-found':
      return 'Produto vinculado não encontrado.';
    case 'loading':
      return 'Carregando Produto vinculado...';
    case 'unavailable':
    case 'error':
      return 'Não foi possível carregar o Produto vinculado.';
  }
}

function ProductBlockDecorator({ nodeKey, productId }: { nodeKey: NodeKey; productId: string }): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelected] = useLexicalNodeSelection(nodeKey);
  const { resolveProduct } = useProductLookup();
  const labelRef = useRef<HTMLSpanElement>(null);
  const [isEditable, setIsEditable] = useState(() => editor.isEditable());

  useEffect(() => {
    return editor.registerEditableListener(setIsEditable);
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const target = getComposedEventTarget(event);
        if (!(target instanceof Node) || !labelRef.current?.contains(target)) {
          return false;
        }
        event.preventDefault();
        clearSelected();
        setSelected(true);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, clearSelected, setSelected]);

  function handleEditClick() {
    editor.dispatchCommand(OPEN_PRODUCT_BLOCK_EDIT_COMMAND, { nodeKey });
  }

  const label = describeProductResolution(resolveProduct(productId));

  return createElement(
    'div',
    { className: isSelected ? styles.productBlockNodeSelected : styles.productBlockNode },
    createElement(
      'span',
      { ref: labelRef, className: styles.productBlockNodeLabel, 'data-product-id': productId },
      label,
    ),
    createElement(
      'button',
      {
        type: 'button',
        className: styles.productBlockNodeEditButton,
        onClick: handleEditClick,
        disabled: !isEditable,
      },
      'Editar bloco de Produto vinculado',
    ),
  );
}

export class ProductBlockNode extends DecoratorBlockNode {
  static getType(): string {
    return PRODUCT_BLOCK_NODE_TYPE;
  }

  static clone(node: ProductBlockNode): ProductBlockNode {
    return new ProductBlockNode(undefined, node.__key);
  }

  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.className = DOM_CLASS_NAME;
    dom.setAttribute('data-lexical-product-block', 'true');
    return dom;
  }

  decorate(): JSX.Element {
    return createElement(ProductBlockDecorator, { nodeKey: this.getKey(), productId: this.getProductId() });
  }

  getProductId(): string {
    return $getState(this, productIdState);
  }

  setProductId(productId: string): this {
    $setState(this, productIdState, productId);
    return this;
  }
}

export function $createProductBlockNode(productId: string): ProductBlockNode {
  const node = new ProductBlockNode();
  node.setProductId(productId);
  return $applyNodeReplacement(node);
}

export function $isProductBlockNode(node: unknown): node is ProductBlockNode {
  return node instanceof ProductBlockNode;
}

export { ProductBlockSyntaxError, parseProductBlockBody, serializeProductBlock };
