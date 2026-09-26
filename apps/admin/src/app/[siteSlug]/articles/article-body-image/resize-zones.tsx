/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/resize-zones.tsx
 *
 * UXE-022 — Resize de imagem por borda/canto (Editorial Serialization
 * Contract §10, rodada de ampliação de escopo autorizada pelo PO).
 *
 * Substitui `resize-handle.tsx` (handle único, só-largura, da rodada
 * anterior desta mesma tarefa) — decisão fechada no desenho aprovado: 8
 * zonas invisíveis sobrepostas às bordas/cantos da imagem, cada uma só
 * por pointer/touch (interação de teclado vive à parte, em
 * `./resize-sliders.tsx`, dois sliders focáveis independentes):
 *
 *   - bordas verticais (E/W — direita/esquerda): alteram só `width`,
 *     cursor `ew-resize`;
 *   - bordas horizontais (N/S — cima/baixo): alteram só `height`, cursor
 *     `ns-resize`;
 *   - cantos (NE/SW): alteram os dois eixos livremente/não-
 *     proporcionalmente, cursor `nesw-resize`;
 *   - cantos (NW/SE): mesma liberdade dos outros dois cantos, cursor
 *     `nwse-resize`.
 *
 * Nenhum handle visual grande — as zonas são invisíveis por construção
 * (`aria-hidden`, sem conteúdo, só a área de hit-test via CSS em
 * `../article-form.module.css`), sinalizadas ao usuário só pelo cursor
 * ao passar por cima. Tamanho do alvo de toque: as classes CSS (não este
 * arquivo) diferenciam `@media (any-pointer: fine)` (~8–12px, mouse
 * "verdadeiro") de `@media (any-pointer: coarse)` (~24px+, alvo de toque
 * efetivo — WCAG 2.5.8/2.5.5) sem nenhuma mudança visual (a zona
 * permanece invisível em ambos os casos) — `any-pointer` (não `pointer`)
 * deliberadamente, para também cobrir dispositivos híbridos
 * touch+mouse, decisão fechada no desenho aprovado.
 *
 * Modelo de captura (decisão fechada no desenho aprovado, igual para as
 * 8 zonas): no `pointerdown`, mede a largura/altura REALMENTE
 * RENDERIZADA da própria `<img>` (`imgRef.current.getBoundingClientRect()`
 * — nunca o `width`/`height` persistido diretamente, que pode não
 * existir ainda) e fixa esse par como ponto de partida do gesto. A cada
 * `pointermove`, calcula o eixo/os eixos que a zona controla a partir
 * desse ponto de partida + delta do ponteiro (nunca incrementalmente a
 * partir do frame anterior — evita deriva de arredondamento), sempre
 * passando os DOIS valores (o alterado e o fixado/"pinado") para
 * `onDimensionsChange` — nunca só um eixo isolado, porque o modelo de
 * interação aprovado sempre persiste os dois juntos a partir do primeiro
 * resize (ver racional completo em `node.ts`, seção UXE-022). Os dois
 * valores passam sempre por `clampImageWidth`/`clampImageHeight`
 * (`@commerce-platform/editorial`) antes de sair deste componente — nunca
 * upscale além de `naturalWidth`/`naturalHeight`, e sempre inteiros
 * (`ImageNode.setDimensions`, consumidor final, lança se receber um valor
 * não-inteiro ou fora da faixa normativa).
 *
 * Mesmo padrão de captura de ponteiro (`setPointerCapture`/
 * `releasePointerCapture` com try/catch — jsdom, usado pela suíte de
 * testes deste app, não implementa essas APIs) e de
 * `stopPropagation`/`preventDefault` em `pointerdown` E `click` (evita
 * reprocessar `NodeSelection`/alcançar o `CLICK_COMMAND` de prioridade
 * EDITOR do Lexical) já estabelecido em `resize-handle.tsx` (rodada
 * anterior) — ver `node.ts` para o racional completo desses dois pontos.
 * `touch-action: none` (CSS) evita que o navegador trate o arraste como
 * scroll/gesto de página em touch.
 */

import { useRef, type JSX, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { clampImageHeight, clampImageWidth } from '@commerce-platform/editorial';
import styles from '../article-form.module.css';

type ZoneAxis = 'width' | 'height' | 'both';

interface ZoneDefinition {
  key: string;
  axis: ZoneAxis;
  className: string;
  /** Sinal aplicado ao delta horizontal do ponteiro para converter em variação de largura (1 = mesmo sentido do arraste; -1 = sentido oposto, zona à esquerda). Zonas que não controlam largura usam 0 (deltaX descartado de qualquer forma pelo axis, mas mantém a fórmula uniforme para as 8 zonas). */
  signX: number;
  /** Mesmo racional de `signX`, para o eixo vertical/altura. Em coordenadas de tela, Y cresce para baixo — por isso a borda de CIMA (N) usa -1 (arrastar para cima aumenta a altura). */
  signY: number;
}

const ZONES: ZoneDefinition[] = [
  { key: 'n', axis: 'height', className: 'resizeZoneN', signX: 0, signY: -1 },
  { key: 's', axis: 'height', className: 'resizeZoneS', signX: 0, signY: 1 },
  { key: 'e', axis: 'width', className: 'resizeZoneE', signX: 1, signY: 0 },
  { key: 'w', axis: 'width', className: 'resizeZoneW', signX: -1, signY: 0 },
  { key: 'ne', axis: 'both', className: 'resizeZoneNE', signX: 1, signY: -1 },
  { key: 'nw', axis: 'both', className: 'resizeZoneNW', signX: -1, signY: -1 },
  { key: 'se', axis: 'both', className: 'resizeZoneSE', signX: 1, signY: 1 },
  { key: 'sw', axis: 'both', className: 'resizeZoneSW', signX: -1, signY: 1 },
];

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
  axis: ZoneAxis;
  signX: number;
  signY: number;
}

export interface ResizeZonesProps {
  /** Ref para a própria `<img>` — usada só para medir a largura/altura REALMENTE renderizada no início de cada gesto (`getBoundingClientRect()`), nunca para ler/gravar estado. */
  imgRef: RefObject<HTMLImageElement | null>;
  /** Resolução intrínseca real da imagem, já carregada — zonas só existem quando os dois valores são conhecidos e >= mínimo normativo (garantia de quem renderiza este componente, ver `node.ts`). */
  naturalWidth: number;
  naturalHeight: number;
  /** Sempre chamado com os DOIS eixos — nunca só o alterado (ver racional no cabeçalho do arquivo). */
  onDimensionsChange: (width: number, height: number) => void;
}

/**
 * Estado de arraste vive em `useRef` (não `useState`): mutado a cada
 * `pointermove`, potencialmente dezenas de vezes por segundo — mesmo
 * racional já estabelecido em `resize-handle.tsx` (rodada anterior).
 */
export function ResizeZones({ imgRef, naturalWidth, naturalHeight, onDimensionsChange }: ResizeZonesProps): JSX.Element {
  const dragState = useRef<DragState | null>(null);

  function handlePointerDown(zone: ZoneDefinition, event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ambiente sem suporte real (ex.: jsdom) — segue sem captura, ver
        // racional completo em `resize-handle.tsx` (rodada anterior).
      }
    }
    dragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      axis: zone.axis,
      signX: zone.signX,
      signY: zone.signY,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const deltaX = (event.clientX - drag.startClientX) * drag.signX;
    const deltaY = (event.clientY - drag.startClientY) * drag.signY;
    // O eixo que a zona NÃO controla ainda passa pelo mesmo clamp — nunca
    // um valor "cru" sem validação de faixa/inteiro — porque o valor
    // fixado ("pinado") também é persistido junto (ver racional no
    // cabeçalho do arquivo).
    const desiredWidth = drag.axis === 'height' ? drag.startWidth : drag.startWidth + deltaX;
    const desiredHeight = drag.axis === 'width' ? drag.startHeight : drag.startHeight + deltaY;
    onDimensionsChange(clampImageWidth(desiredWidth, naturalWidth), clampImageHeight(desiredHeight, naturalHeight));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Mesmo racional de `handlePointerDown`.
      }
    }
    dragState.current = null;
  }

  /**
   * Mesmo racional de `resize-handle.tsx` (rodada anterior):
   * `stopPropagation` em `pointerdown` não impede o `click` nativo
   * subsequente (pointerup + mouseup já completos) de ainda alcançar o
   * `CLICK_COMMAND` de prioridade EDITOR do Lexical — são dois eventos
   * distintos na árvore DOM.
   */
  function handleClick(event: ReactMouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <>
      {ZONES.map((zone) => (
        <div
          key={zone.key}
          data-resize-zone={zone.key}
          className={`${styles.resizeZone} ${styles[zone.className]}`}
          aria-hidden="true"
          onPointerDown={(event) => handlePointerDown(zone, event)}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={handleClick}
        />
      ))}
    </>
  );
}
