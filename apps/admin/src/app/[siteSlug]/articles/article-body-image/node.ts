/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/node.ts
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade.
 *
 * `ImageNode` — `DecoratorBlockNode` (`@lexical/react/LexicalDecoratorBlockNode`),
 * NÃO `ElementNode` (correção desta rodada — ver relatório da
 * investigação anterior). Evidência concreta que motivou a migração,
 * verificada diretamente contra o código-fonte real instalado do
 * `lexical@0.49.0` (`LexicalReconciler.ts`): todo `ElementNode` de bloco
 * (não-inline) com zero filhos Lexical entra no mecanismo de "managed
 * line break" (`$isLastChildLineBreakOrDecorator` +
 * `ElementDOMSlot.setManagedLineBreak`) — o mesmo `<br
 * data-lexical-managed-linebreak>` que dá alvo de caret a um parágrafo
 * vazio comum é inserido dentro do MESMO dom retornado por `createDOM()`,
 * ao lado de qualquer conteúdo manual (o `<img>` da versão anterior deste
 * node). Um embed atômico de imagem não deveria carregar esse efeito
 * colateral. `DecoratorBlockNode` nunca passa por esse caminho: no mesmo
 * reconciler, o branch de `DecoratorNode` monta o conteúdo via
 * `decorate()` (React, através de portal — `reconcileDecorator`,
 * consumido por `useDecorators`/`LegacyDecorators`), nunca via
 * reconciliação de filhos Lexical — nenhum `<br>` gerenciado é possível
 * por construção. `LegacyDecorators` já é renderizado internamente por
 * `RichTextPlugin` (`@lexical/react/LexicalRichTextPlugin`), já usado em
 * `article-body-editor.tsx` — nenhuma mudança adicional foi necessária
 * lá para os decorators passarem a ser montados.
 *
 * Contrato de `DecoratorBlockNode` usado corretamente (não troca nominal
 * de superclasse):
 * - `createDOM()` só cria o `<div>` contêiner (classe/atributo só para
 *   identificação no DOM e nos testes) — `@lexical/react` já marca
 *   `contentEditable = 'false'` nele automaticamente para todo
 *   `DecoratorNode` (reconciler, `$createNode`), então este node não
 *   precisa repetir isso;
 * - `decorate()` devolve o elemento React `<img>` de verdade, com `src`/
 *   `alt` reais — é isso que o reconciler monta dentro do `<div>` via
 *   portal. Usa `React.createElement` em vez de sintaxe JSX
 *   deliberadamente, para manter este arquivo como `.ts` (evita o
 *   trade-off de renomear para `.tsx` só por causa de um único elemento);
 * - nenhum filho Lexical em nenhum momento (igual à versão anterior) —
 *   `DecoratorNode`/`DecoratorBlockNode` nem expõem `append()`/
 *   `getChildren()` (métodos exclusivos de `ElementNode`), então isso
 *   agora é uma garantia estrutural, não só comportamental;
 * - estado (`src`/`alt`) continua via `createState`/`$getState`/
 *   `$setState` — API de `LexicalNode` (base de ambas as classes), não
 *   de `ElementNode` — nada muda aqui além da superclasse;
 * - `static clone` preserva a mesma chave (`new ImageNode(undefined,
 *   node.__key)`): `LexicalNode.afterCloneFrom` copia `__state` (src/alt)
 *   e `DecoratorBlockNode.afterCloneFrom` copia `__format` automaticamente
 *   quando a chave é igual — mesmo princípio já usado por
 *   `ProductBlockNode` para `productId` (que permanece `ElementNode`
 *   nesta tarefa, deliberadamente fora do escopo da UXE-010 — ver
 *   relatório da tarefa: migração de `ProductBlockNode` é pendência
 *   registrada para a investigação da UXE-011, não implementada aqui).
 *
 * Bloco atômico, não editável, selecionável/removível via teclado como
 * unidade — `DecoratorNode.isKeyboardSelectable()` já retorna `true` por
 * padrão, sem necessidade de override. `DecoratorBlockNode.isInline()`
 * já retorna `false` (bloco, não inline) — mesmo comportamento da versão
 * anterior. Nenhum crop/resize, nenhuma UI de edição de imagem — fora de
 * escopo desta tarefa.
 *
 * Seleção/remoção via clique + Delete/Backspace (correção desta rodada —
 * bug real de validação manual: a imagem ficava "presa", impossível de
 * remover pelo editor). `DecoratorBlockNode` sozinho não implementa isso —
 * o próprio doc comment da classe (`@lexical/react/LexicalDecoratorBlockNode`)
 * diz que normalmente se usa `BlockWithAlignableContents` para
 * seleção/alinhamento. Não usamos esse componente pronto: ele só seleciona
 * quando `getComposedEventTarget(event) === ref.current` (igualdade
 * estrita com o próprio wrapper) — verificado diretamente contra
 * `LexicalBlockWithAlignableContents.tsx` e `getComposedEventTarget`
 * (`LexicalUtils.ts`, que devolve `event.target`, o elemento realmente
 * clicado). Como nosso conteúdo real é um `<img>` FILHO do wrapper,
 * clicar na própria imagem nunca bateria com essa igualdade estrita — só
 * clicar numa borda/wrapper invisível funcionaria. `ImageDecorator`
 * abaixo faz o wiring mínimo equivalente (mesmo `useLexicalNodeSelection`
 * usado por `BlockWithAlignableContents`), mas checando
 * `ref.current?.contains(target)` em vez de igualdade estrita — clique em
 * qualquer ponto do bloco, incluindo a imagem, seleciona.
 *
 * `COMMAND_PRIORITY_LOW` (mesma prioridade de `BlockWithAlignableContents`)
 * não é arbitrário: verificado em `LexicalUpdates.ts` que o dispatcher de
 * comandos itera prioridades de 4 (CRITICAL) a 0 (EDITOR) e retorna assim
 * que um handler devolve `true` — nunca chega aos handlers de prioridade
 * mais baixa. `registerRichText` (`@lexical/rich-text`) registra seu
 * próprio `CLICK_COMMAND` em `COMMAND_PRIORITY_EDITOR` (0) que limpa
 * qualquer `NodeSelection` existente a cada clique
 * (`$isNodeSelection(selection) → selection.clear(); return true`). Sem
 * `COMMAND_PRIORITY_LOW` aqui, um clique na imagem selecionaria e
 * imediatamente desselecionaria no mesmo evento. Delete/Backspace
 * removendo o node selecionado já é comportamento genérico de
 * `registerRichText` (`DELETE_CHARACTER_COMMAND`/`KEY_DELETE_COMMAND`/
 * `KEY_BACKSPACE_COMMAND`, branch `$isNodeSelection` →
 * `selection.deleteNodes()`) — nenhuma lógica de remoção própria
 * implementada aqui, só a seleção que faltava para ativar o que já existe.
 */

import { createElement, useEffect, useRef, type JSX } from 'react';
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
import styles from '../article-form.module.css';

export const IMAGE_NODE_TYPE = 'article-body-image';

const srcState = createState('src', {
  parse: (value: unknown): string => (typeof value === 'string' ? value : ''),
});

const altState = createState('alt', {
  parse: (value: unknown): string => (typeof value === 'string' ? value : ''),
});

const DOM_CLASS_NAME = 'article-body-image-node';

/**
 * Componente real por trás de `decorate()` — precisa ser um componente de
 * função de verdade (não um elemento solto via `createElement` direto no
 * corpo de `decorate()`) para poder usar hooks (`useLexicalNodeSelection`,
 * `useLexicalComposerContext`). Continua em `createElement` (sem JSX) pelo
 * mesmo motivo já documentado no cabeçalho do arquivo: manter este módulo
 * como `.ts`.
 */
function ImageDecorator({ nodeKey, src, alt }: { nodeKey: NodeKey; src: string; alt: string }): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelected] = useLexicalNodeSelection(nodeKey);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const target = getComposedEventTarget(event);
        if (!(target instanceof Node) || !imgRef.current?.contains(target)) {
          return false;
        }
        event.preventDefault();
        // Mesmo padrão de `BlockWithAlignableContents`: limpa qualquer
        // seleção anterior antes de selecionar este node — um clique
        // simples (sem Shift, fora de escopo aqui) sempre resulta em
        // exatamente este node selecionado, nunca acumulado com outro.
        clearSelected();
        setSelected(true);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, clearSelected, setSelected]);

  return createElement('img', {
    ref: imgRef,
    src,
    alt,
    className: isSelected ? styles.imageNodeSelected : undefined,
  });
}

export class ImageNode extends DecoratorBlockNode {
  static getType(): string {
    return IMAGE_NODE_TYPE;
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(undefined, node.__key);
  }

  /**
   * Só o `<div>` contêiner — identificável no DOM/testes via classe e
   * atributo. O conteúdo real (`<img>`) vem de `decorate()`, montado pelo
   * reconciler via portal React dentro deste elemento; `contentEditable`
   * é aplicado automaticamente pelo reconciler para todo `DecoratorNode`,
   * não precisa ser repetido aqui.
   */
  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.className = DOM_CLASS_NAME;
    dom.setAttribute('data-lexical-article-body-image', 'true');
    return dom;
  }

  /**
   * Conteúdo React real do bloco — `<img>` com `src`/`alt` atuais do
   * node. `React.createElement` (não JSX) para manter este arquivo como
   * `.ts`, ver doc comment do arquivo.
   */
  decorate(): JSX.Element {
    return createElement(ImageDecorator, { nodeKey: this.getKey(), src: this.getSrc(), alt: this.getAlt() });
  }

  getSrc(): string {
    return $getState(this, srcState);
  }

  getAlt(): string {
    return $getState(this, altState);
  }

  setSrcAndAlt(src: string, alt: string): this {
    $setState(this, srcState, src);
    $setState(this, altState, alt);
    return this;
  }
}

export function $createImageNode(src: string, alt: string): ImageNode {
  const node = new ImageNode();
  node.setSrcAndAlt(src, alt);
  return $applyNodeReplacement(node);
}

export function $isImageNode(node: unknown): node is ImageNode {
  return node instanceof ImageNode;
}
