/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/node.ts
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade.
 *
 * `ImageNode` — `DecoratorBlockNode` (`@lexical/react/LexicalDecoratorBlockNode`),
 * NÃO `ElementNode` (correção de rodada anterior). Evidência concreta que
 * motivou a migração, verificada diretamente contra o código-fonte real
 * instalado do `lexical@0.49.0` (`LexicalReconciler.ts`): todo
 * `ElementNode` de bloco (não-inline) com zero filhos Lexical entra no
 * mecanismo de "managed line break" (`$isLastChildLineBreakOrDecorator` +
 * `ElementDOMSlot.setManagedLineBreak`) — o mesmo `<br
 * data-lexical-managed-linebreak>` que dá alvo de caret a um parágrafo
 * vazio comum é inserido dentro do MESMO dom retornado por `createDOM()`,
 * ao lado de qualquer conteúdo manual. Um embed atômico de imagem não
 * deveria carregar esse efeito colateral. `DecoratorBlockNode` nunca
 * passa por esse caminho: no mesmo reconciler, o branch de
 * `DecoratorNode` monta o conteúdo via `decorate()` (React, através de
 * portal — `reconcileDecorator`, consumido por
 * `useDecorators`/`LegacyDecorators`), nunca via reconciliação de filhos
 * Lexical — nenhum `<br>` gerenciado é possível por construção.
 * `LegacyDecorators` já é renderizado internamente por `RichTextPlugin`
 * (`@lexical/react/LexicalRichTextPlugin`), já usado em
 * `article-body-editor.tsx`.
 *
 * Contrato de `DecoratorBlockNode` usado corretamente:
 * - `createDOM()` só cria o `<div>` contêiner (classe/atributo só para
 *   identificação no DOM e nos testes) — `@lexical/react` já marca
 *   `contentEditable = 'false'` nele automaticamente para todo
 *   `DecoratorNode`;
 * - `decorate()` devolve o conteúdo React real (`<img>` + zonas/sliders de
 *   resize condicionais) — é isso que o reconciler monta dentro do `<div>`
 *   via portal. Usa `React.createElement` em vez de sintaxe JSX
 *   deliberadamente, para manter este arquivo como `.ts` (as zonas de
 *   resize e os sliders de teclado, que precisam de JSX de verdade para
 *   sua própria interação, vivem em `./resize-zones.tsx` e
 *   `./resize-sliders.tsx`, arquivos `.tsx` próprios);
 * - nenhum filho Lexical em nenhum momento — `DecoratorNode`/
 *   `DecoratorBlockNode` nem expõem `append()`/`getChildren()`, então
 *   isso é uma garantia estrutural, não só comportamental;
 * - estado (`src`/`alt`/`width`/`height`) via `createState`/`$getState`/
 *   `$setState` — API de `LexicalNode` (base de ambas as classes);
 * - `static clone` preserva a mesma chave (`new ImageNode(undefined,
 *   node.__key)`): `LexicalNode.afterCloneFrom` copia `__state`
 *   (src/alt/width/height) e `DecoratorBlockNode.afterCloneFrom` copia
 *   `__format` automaticamente quando a chave é igual.
 *
 * Bloco atômico, não editável, selecionável/removível via teclado como
 * unidade — `DecoratorNode.isKeyboardSelectable()` já retorna `true` por
 * padrão. `DecoratorBlockNode.isInline()` já retorna `false`.
 *
 * Seleção/remoção via clique + Delete/Backspace (bug real de validação
 * manual corrigido em rodada anterior: a imagem ficava "presa",
 * impossível de remover). `DecoratorBlockNode` sozinho não implementa
 * isso — o próprio doc comment da classe diz que normalmente se usa
 * `BlockWithAlignableContents` para seleção/alinhamento. Não usamos esse
 * componente pronto: ele só seleciona quando `getComposedEventTarget(event)
 * === ref.current` (igualdade estrita com o próprio wrapper) — verificado
 * diretamente contra `LexicalBlockWithAlignableContents.tsx` e
 * `getComposedEventTarget` (`LexicalUtils.ts`, que devolve `event.target`,
 * o elemento realmente clicado). Como nosso conteúdo real é um `<img>`
 * FILHO do wrapper, clicar na própria imagem nunca bateria com essa
 * igualdade estrita. `ImageDecorator` abaixo faz o wiring mínimo
 * equivalente (mesmo `useLexicalNodeSelection` usado por
 * `BlockWithAlignableContents`), mas checando `imgRef.current?.contains(target)`
 * — clique em qualquer ponto da própria imagem seleciona; clique numa
 * zona de resize ou num slider (elementos IRMÃOS do `<img>`, nunca
 * descendentes dele) nunca bate nessa checagem, então nunca reprocessa
 * seleção por cima da própria interação de resize.
 *
 * `COMMAND_PRIORITY_LOW` (mesma prioridade de `BlockWithAlignableContents`)
 * não é arbitrário: verificado em `LexicalUpdates.ts` que o dispatcher de
 * comandos itera prioridades de 4 (CRITICAL) a 0 (EDITOR) e retorna assim
 * que um handler devolve `true`. `registerRichText` (`@lexical/rich-text`)
 * registra seu próprio `CLICK_COMMAND` em `COMMAND_PRIORITY_EDITOR` (0)
 * que limpa qualquer `NodeSelection` existente a cada clique. Um clique
 * numa zona/slider de resize, por não bater em
 * `imgRef.current?.contains(target)`, devolveria `false` e chegaria até
 * esse handler de prioridade EDITOR, limpando a seleção logo depois da
 * interação — por isso `resize-zones.tsx`/`resize-sliders.tsx` chamam
 * `event.stopPropagation()` também no `onClick` (além do `onPointerDown`),
 * impedindo o clique nativo subsequente de sequer alcançar o dispatcher de
 * comandos do Lexical.
 *
 * UXE-022 (ampliação de escopo, Editorial Serialization Contract §10) —
 * `width`/`height` opcionais, persistidos via `widthState`/`heightState`.
 * Decisão fechada no desenho aprovado (rodada de border/corner resize):
 *
 * - `getWidth()`/`getHeight()`/`setWidth()`/`setDimensions()` são
 *   acessores INDEPENDENTES de `getSrc()`/`getAlt()`/`setSrcAndAlt()` — o
 *   fluxo de upload nunca passa `width`/`height`.
 * - `widthState.parse`/`heightState.parse` usam `isValidImageWidth`/
 *   `isValidImageHeight` (`@commerce-platform/editorial`) — a validação
 *   normativa completa (inteiro E faixa 100–1200), nunca só
 *   `Number.isInteger` — na DESSERIALIZAÇÃO. Como `$setState` (chamado
 *   por `setWidth`/`setDimensions`) não passa pelo `parse` (só grava o
 *   valor bruto — confirmado contra `LexicalNodeState.ts` real instalado:
 *   `$setState` chama `state.updateFromKnown(stateConfig, value)`
 *   diretamente), os dois métodos abaixo fazem a MESMA validação
 *   explicitamente antes de gravar.
 * - `setDimensions(width, height)` é o ÚNICO mutador capaz de gravar
 *   `height` — não existe `setHeight()` isolado. Isso codifica
 *   estruturalmente o invariante normativo da gramática (Contract §10,
 *   `packages/editorial/src/image/grammar.ts`): "`height` nunca existe
 *   sem `width`" — nenhum estado real deste node pode chegar a
 *   `{height: N, width: undefined}`. Valida OS DOIS eixos antes de
 *   gravar qualquer um (atomicidade — mesmo critério já normativo na
 *   gramática para a extensão combinada `{width=N height=M}`); lança se
 *   qualquer um for inválido, sem gravar nada.
 * - `setWidth(undefined)` também limpa `height` — remover a largura
 *   remove a extensão inteira (nunca deixa `height` orfão). `setWidth(N)`
 *   com `N` definido só altera `width`, preservando `height` existente
 *   (nenhum chamador real hoje invoca `setWidth` com um `height` já
 *   presente — a interação de resize sempre usa `setDimensions` — mas o
 *   método permanece correto isoladamente).
 * - `undefined` é o valor por padrão (ausência de `width`/`height`) —
 *   mesma semântica de "sem width" já normativa desde a UXE-010; nunca um
 *   sentinel numérico (`0`, `-1`).
 * - `ImageDecorator` renderiza três casos, espelhando exatamente os três
 *   estados persistíveis normativos (Contract §10): nenhuma dimensão
 *   (`<img>` sem `style` de dimensão, comportamento legado inalterado da
 *   UXE-010); só `width` (`style: {width:'Npx', height:'auto'}`,
 *   comportamento legado inalterado da rodada anterior desta mesma
 *   tarefa); `width`+`height` juntos (`style: {aspectRatio:'W / H',
 *   width:'100%', maxWidth:'Wpx', height:'auto'}` — a técnica confirmada
 *   empiricamente, ver prova real registrada no relatório desta tarefa,
 *   como a ÚNICA forma que preserva a proporção PERSISTIDA — nunca a
 *   intrínseca real do arquivo — ao encolher em viewports estreitos,
 *   porque `width`/`height` nativos sozinhos sempre cedem para a
 *   proporção intrínseca real assim que a imagem carrega).
 * - Zonas de resize (`./resize-zones.tsx`, pointer/touch, 8 zonas
 *   invisíveis) e sliders de teclado (`./resize-sliders.tsx`, 2 sliders
 *   focáveis independentes — Largura/Altura) só são oferecidos quando a
 *   imagem está selecionada, já carregou (`naturalWidth`/`naturalHeight`
 *   conhecidos, via `onLoad` do `<img>`) E os dois `>= MIN_IMAGE_WIDTH`/
 *   `MIN_IMAGE_HEIGHT` respectivamente — decisão fechada no desenho
 *   aprovado (evita `aria-valuemax < aria-valuemin` em qualquer um dos
 *   dois sliders).
 * - Qualquer interação de resize (arraste numa zona OU ajuste num slider
 *   de teclado) sempre chama `setDimensions(width, height)` — NUNCA
 *   `setWidth` isolado — porque o modelo de interação aprovado sempre
 *   captura e persiste os dois eixos juntos a partir do primeiro resize
 *   (mesmo quando só um eixo muda visualmente: o outro é persistido no
 *   valor efetivo atual, "pinado"). Ver `resize-zones.tsx`/
 *   `resize-sliders.tsx` para o racional completo de cada zona/slider.
 * - `Enter` com a `ImageNode` selecionada (e só ela — `NodeSelection` de
 *   exatamente este node) move o foco para o slider de LARGURA primeiro
 *   (decisão fechada no desenho: Largura antes de Altura), quando os
 *   controles de resize existem; `Tab` a partir dele alcança o slider de
 *   Altura em seguida (ordem natural do DOM — ver `resize-sliders.tsx`).
 *   `Escape` em qualquer um dos dois sliders devolve o foco ao editor via
 *   `editor.focus()`, sem alterar a `NodeSelection` atual — `editor.focus()`
 *   (API pública do Lexical) só move o foco DOM para o elemento raiz, não
 *   sobrescreve uma seleção já existente no `EditorState` quando uma já
 *   existe (verificado contra `LexicalEditor.ts`/`focus()`, real
 *   instalado).
 */

import { createElement, useEffect, useRef, useState, type JSX, type SyntheticEvent } from 'react';
import { DecoratorBlockNode } from '@lexical/react/LexicalDecoratorBlockNode';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import {
  $applyNodeReplacement,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  createState,
  $getState,
  $setState,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
  getComposedEventTarget,
  type NodeKey,
} from 'lexical';
import {
  MIN_IMAGE_HEIGHT,
  MIN_IMAGE_WIDTH,
  clampImageHeight,
  clampImageWidth,
  isValidImageHeight,
  isValidImageWidth,
} from '@commerce-platform/editorial';
import { ResizeZones } from './resize-zones';
import { ResizeSliders } from './resize-sliders';
import styles from '../article-form.module.css';

export const IMAGE_NODE_TYPE = 'article-body-image';

const srcState = createState('src', {
  parse: (value: unknown): string => (typeof value === 'string' ? value : ''),
});

const altState = createState('alt', {
  parse: (value: unknown): string => (typeof value === 'string' ? value : ''),
});

const widthState = createState('width', {
  parse: (value: unknown): number | undefined =>
    typeof value === 'number' && isValidImageWidth(value) ? value : undefined,
});

const heightState = createState('height', {
  parse: (value: unknown): number | undefined =>
    typeof value === 'number' && isValidImageHeight(value) ? value : undefined,
});

const DOM_CLASS_NAME = 'article-body-image-node';

function $getImageNodeOrNull(nodeKey: NodeKey): ImageNode | null {
  const node = $getNodeByKey(nodeKey);
  return $isImageNode(node) ? node : null;
}

/**
 * Componente real por trás de `decorate()` — precisa ser um componente de
 * função de verdade (não um elemento solto via `createElement` direto no
 * corpo de `decorate()`) para poder usar hooks. Continua em
 * `createElement` (sem JSX) pelo mesmo motivo já documentado no cabeçalho
 * do arquivo: manter este módulo como `.ts`.
 */
function ImageDecorator({
  nodeKey,
  src,
  alt,
  width,
  height,
}: {
  nodeKey: NodeKey;
  src: string;
  alt: string;
  width: number | undefined;
  height: number | undefined;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelected] = useLexicalNodeSelection(nodeKey);
  const imgRef = useRef<HTMLImageElement>(null);
  const widthSliderRef = useRef<HTMLDivElement>(null);
  const [naturalWidth, setNaturalWidth] = useState<number | undefined>(undefined);
  const [naturalHeight, setNaturalHeight] = useState<number | undefined>(undefined);

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

  useEffect(() => {
    // `Enter` com esta `ImageNode` selecionada (NodeSelection de
    // exatamente este node, nunca uma seleção múltipla que o inclua)
    // move o foco para o slider de Largura, quando os controles de
    // resize existem (imagem já carregada e as duas dimensões naturais
    // >= mínimo normativo — ver racional no cabeçalho do arquivo).
    // Quando os controles não existem, devolve `false` — deixa o
    // comportamento padrão do Lexical para `Enter` intocado.
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        const selection = $getSelection();
        if (
          !$isNodeSelection(selection) ||
          selection.getNodes().length !== 1 ||
          selection.getNodes()[0].getKey() !== nodeKey
        ) {
          return false;
        }
        if (!widthSliderRef.current) {
          return false;
        }
        widthSliderRef.current.focus();
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, nodeKey]);

  const resizeControlsAvailable =
    isSelected &&
    naturalWidth !== undefined &&
    naturalHeight !== undefined &&
    naturalWidth >= MIN_IMAGE_WIDTH &&
    naturalHeight >= MIN_IMAGE_HEIGHT;

  // Três casos, espelhando os três estados persistíveis normativos
  // (Contract §10) — ver racional completo no cabeçalho do arquivo.
  const imgStyle: Record<string, string> | undefined =
    width === undefined
      ? undefined
      : height === undefined
        ? { width: `${width}px`, height: 'auto' }
        : { aspectRatio: `${width} / ${height}`, width: '100%', maxWidth: `${width}px`, height: 'auto' };

  function commitDimensions(nextWidth: number, nextHeight: number): void {
    editor.update(() => {
      $getImageNodeOrNull(nodeKey)?.setDimensions(nextWidth, nextHeight);
    });
  }

  return createElement(
    'div',
    { className: styles.imageNodeWrapper },
    createElement('img', {
      ref: imgRef,
      src,
      alt,
      className: isSelected ? styles.imageNodeSelected : undefined,
      style: imgStyle,
      onLoad: (event: SyntheticEvent<HTMLImageElement>) => {
        setNaturalWidth(event.currentTarget.naturalWidth);
        setNaturalHeight(event.currentTarget.naturalHeight);
      },
    }),
    resizeControlsAvailable
      ? createElement(ResizeZones, {
          imgRef,
          naturalWidth: naturalWidth as number,
          naturalHeight: naturalHeight as number,
          onDimensionsChange: commitDimensions,
        })
      : null,
    resizeControlsAvailable
      ? createElement(ResizeSliders, {
          currentWidth: clampImageWidth(width ?? (naturalWidth as number), naturalWidth as number),
          currentHeight: clampImageHeight(height ?? (naturalHeight as number), naturalHeight as number),
          naturalWidth: naturalWidth as number,
          naturalHeight: naturalHeight as number,
          widthSliderRef,
          onDimensionsChange: commitDimensions,
          onEscape: () => {
            editor.focus();
          },
        })
      : null,
  );
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
   * atributo. O conteúdo real (`<img>` + zonas/sliders de resize) vem de
   * `decorate()`, montado pelo reconciler via portal React dentro deste
   * elemento; `contentEditable` é aplicado automaticamente pelo
   * reconciler para todo `DecoratorNode`, não precisa ser repetido aqui.
   */
  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.className = DOM_CLASS_NAME;
    dom.setAttribute('data-lexical-article-body-image', 'true');
    return dom;
  }

  /**
   * Conteúdo React real do bloco — `<img>` com `src`/`alt`/`width`/
   * `height` atuais do node, mais zonas/sliders de resize quando
   * aplicável. `React.createElement` (não JSX) para manter este arquivo
   * como `.ts`, ver doc comment do arquivo.
   */
  decorate(): JSX.Element {
    return createElement(ImageDecorator, {
      nodeKey: this.getKey(),
      src: this.getSrc(),
      alt: this.getAlt(),
      width: this.getWidth(),
      height: this.getHeight(),
    });
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

  /**
   * Independente de `getSrc()`/`getAlt()`/`setSrcAndAlt()` — decisão
   * fechada no desenho aprovado (UXE-022): `width` nunca precisa ser
   * setado junto de `src`/`alt` por necessidade estrutural nenhuma.
   */
  getWidth(): number | undefined {
    return $getState(this, widthState);
  }

  /**
   * Independente de `getWidth()`/`setWidth()` na leitura — mas nunca pode
   * existir sem `width` (ver `setDimensions`, o único mutador capaz de
   * gravar `height`, e `setWidth(undefined)`, que limpa os dois).
   */
  getHeight(): number | undefined {
    return $getState(this, heightState);
  }

  /**
   * Valida com `isValidImageWidth` (a MESMA validação normativa completa
   * usada por `widthState.parse` na desserialização — nunca só
   * `Number.isInteger`) antes de gravar, porque `$setState` não passa
   * pelo `parse` (ver racional no cabeçalho do arquivo) — sem esta
   * checagem explícita, o invariante "só um `width` válido pode existir
   * no estado do node" dependeria inteiramente do bom comportamento de
   * quem chama, nunca sendo realmente estrutural.
   *
   * `width === undefined` remove o `width` (volta ao comportamento
   * legado, sem extensão) E também remove `height`, se presente —
   * decisão fechada no desenho aprovado: nunca deixa `height` órfão
   * (mesmo invariante estrutural de `setDimensions`, aplicado aqui pelo
   * caminho inverso). `width` definido preserva `height` existente
   * (nenhum chamador real hoje invoca `setWidth` com um `height` já
   * presente — a interação de resize sempre usa `setDimensions` — mas o
   * método permanece correto isoladamente). Sempre uma gravação válida,
   * nunca lançada, exceto por `width` sintaticamente numérico mas fora da
   * faixa normativa.
   */
  setWidth(width: number | undefined): this {
    if (width !== undefined && !isValidImageWidth(width)) {
      throw new Error(
        `ImageNode.setWidth: width inválido (${JSON.stringify(width)}) — esperado inteiro entre ${MIN_IMAGE_WIDTH} e o máximo normativo, ou undefined.`,
      );
    }
    $setState(this, widthState, width);
    if (width === undefined) {
      $setState(this, heightState, undefined);
    }
    return this;
  }

  /**
   * ÚNICO mutador capaz de gravar `height` — não existe `setHeight()`
   * isolado (ver racional completo no cabeçalho do arquivo: codifica
   * estruturalmente o invariante normativo da gramática "`height` nunca
   * existe sem `width`"). Valida OS DOIS eixos (`isValidImageWidth`/
   * `isValidImageHeight`) antes de gravar qualquer um — atomicidade,
   * mesmo critério já normativo na gramática para `{width=N height=M}`:
   * nunca grava só o eixo válido quando o outro é inválido. Lança
   * (nunca grava parcialmente) quando qualquer um dos dois é inválido.
   */
  setDimensions(width: number, height: number): this {
    if (!isValidImageWidth(width) || !isValidImageHeight(height)) {
      throw new Error(
        `ImageNode.setDimensions: width/height inválidos (width=${JSON.stringify(width)}, height=${JSON.stringify(height)}) — esperado width inteiro entre ${MIN_IMAGE_WIDTH} e o máximo normativo, height inteiro entre ${MIN_IMAGE_HEIGHT} e o máximo normativo.`,
      );
    }
    $setState(this, widthState, width);
    $setState(this, heightState, height);
    return this;
  }
}

export function $createImageNode(src: string, alt: string, width?: number, height?: number): ImageNode {
  const node = new ImageNode();
  node.setSrcAndAlt(src, alt);
  if (width !== undefined && height !== undefined) {
    node.setDimensions(width, height);
  } else if (width !== undefined) {
    node.setWidth(width);
  }
  return $applyNodeReplacement(node);
}

export function $isImageNode(node: unknown): node is ImageNode {
  return node instanceof ImageNode;
}
