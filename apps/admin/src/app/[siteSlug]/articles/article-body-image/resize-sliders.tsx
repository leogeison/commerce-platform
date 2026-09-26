/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/resize-sliders.tsx
 *
 * UXE-022 — Resize de imagem por borda/canto (Editorial Serialization
 * Contract §10, rodada de ampliação de escopo autorizada pelo PO).
 *
 * Interação de TECLADO do resize — separada das 8 zonas de pointer/touch
 * (`./resize-zones.tsx`) desde o desenho aprovado (Opção D): dois
 * elementos `role="slider"` INDEPENDENTES, cada um com seu próprio
 * `aria-valuemin`/`aria-valuemax`/`aria-valuenow`/`aria-valuetext` — "
 * Largura da imagem" (setas Esquerda/Direita, Shift = passo grande) e
 * "Altura da imagem" (setas Cima/Baixo, Shift = passo grande) — nunca um
 * único slider bidimensional (não existe semântica ARIA padrão para
 * "slider de duas dimensões"; dois sliders de uma dimensão cada é o
 * padrão WAI-ARIA APG reconhecido). Slider de Largura é renderizado
 * ANTES do de Altura na árvore DOM — decisão fechada no desenho
 * aprovado: `Enter` na `ImageNode` selecionada foca o de Largura primeiro
 * (`node.ts`, via `widthSliderRef`), `Tab` a partir dele alcança o de
 * Altura em seguida pela ordem natural do DOM, nunca por um `tabIndex`
 * numérico manual.
 *
 * Cada ajuste de teclado sempre chama `onDimensionsChange(width, height)`
 * com OS DOIS valores — nunca só o alterado — porque o modelo de
 * interação aprovado sempre persiste os dois juntos a partir do primeiro
 * resize (mesmo racional de `resize-zones.tsx`; ver `node.ts` para o
 * racional completo). O eixo que o slider não controla é passado
 * inalterado (o valor efetivo atual, já a "largura/altura correntemente
 * renderizada" por construção — `currentWidth`/`currentHeight`, props
 * resolvidas por `node.ts` a partir do `width`/`height` persistido ou,
 * na ausência de um dos dois, de `naturalWidth`/`naturalHeight`).
 *
 * Visualmente oculto até o foco (`styles.imageDimensionSlider`, CSS em
 * `../article-form.module.css`) — técnica "clip" (posição absoluta,
 * 1x1px, `clip-path`/`clip` + `overflow:hidden` + margem negativa),
 * NUNCA `display:none`/`visibility:hidden` (decisão fechada no desenho
 * aprovado: as duas propriedades removeriam o elemento da árvore de
 * acessibilidade/ordem de tabulação — o próprio ponto que a técnica visa
 * evitar). Ao ganhar foco visível (`:focus-visible`), o elemento cresce
 * para um "chip" legível (mostrando o valor atual em px) — mas SEMPRE em
 * `position: absolute`, tanto oculto quanto focado, então crescer nunca
 * desloca o layout ao redor (correção final do desenho aprovado: um
 * elemento em fluxo normal que ganha tamanho ao focar empurraria
 * conteúdo vizinho; um elemento já fora do fluxo, por construção, nunca
 * o faz).
 *
 * Mesmo racional de `resize-handle.tsx`/`resize-zones.tsx` para
 * `preventDefault`/`stopPropagation` em `Escape` (significado próprio:
 * devolve o foco ao editor via `onEscape`, nunca o comportamento padrão
 * do Lexical/browser para Escape em outro contexto) e nas setas
 * relevantes de cada slider (navegação normal do Lexical fora dos
 * sliders permanece intocada — garantia estrutural: este `onKeyDown` só
 * existe nestes elementos).
 */

import { useRef, type JSX, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import {
  MAX_IMAGE_HEIGHT,
  MAX_IMAGE_WIDTH,
  MIN_IMAGE_HEIGHT,
  MIN_IMAGE_WIDTH,
  clampImageHeight,
  clampImageWidth,
} from '@commerce-platform/editorial';
import styles from '../article-form.module.css';

const KEYBOARD_STEP = 10;
const KEYBOARD_STEP_LARGE = 50;

export interface ResizeSlidersProps {
  /** Largura/altura efetivas atuais em px — já resolvidas pelo chamador (`node.ts`): `width`/`height` persistidos, ou `naturalWidth`/`naturalHeight` quando um dos dois ainda não existe. */
  currentWidth: number;
  currentHeight: number;
  /** Resolução intrínseca real da imagem, já carregada — sliders só existem quando os dois valores são conhecidos e >= mínimo normativo (garantia de quem renderiza este componente, ver `node.ts`). */
  naturalWidth: number;
  naturalHeight: number;
  /** Sempre chamado com os DOIS eixos — nunca só o alterado (ver racional no cabeçalho do arquivo). */
  onDimensionsChange: (width: number, height: number) => void;
  /** Chamado quando Escape é pressionado em qualquer um dos dois sliders — quem chama devolve o foco ao editor, mantendo a imagem selecionada (NodeSelection intocada). */
  onEscape: () => void;
  /** Ref exposta para permitir foco imperativo (Enter na ImageNode selecionada → foco no slider de Largura primeiro, decisão fechada no desenho — ver `node.ts`). */
  widthSliderRef: RefObject<HTMLDivElement | null>;
}

export function ResizeSliders({
  currentWidth,
  currentHeight,
  naturalWidth,
  naturalHeight,
  onDimensionsChange,
  onEscape,
  widthSliderRef,
}: ResizeSlidersProps): JSX.Element {
  const heightSliderRef = useRef<HTMLDivElement>(null);

  const effectiveMaxWidth = Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, Math.floor(naturalWidth)));
  const effectiveMaxHeight = Math.min(MAX_IMAGE_HEIGHT, Math.max(MIN_IMAGE_HEIGHT, Math.floor(naturalHeight)));

  function handleWidthKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      onDimensionsChange(clampImageWidth(currentWidth + direction * step, naturalWidth), currentHeight);
    }
  }

  function handleHeightKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
      // Em coordenadas de tela Y cresce para baixo, mas para um slider de
      // ALTURA a convenção esperada (mesmo padrão de qualquer slider
      // vertical WAI-ARIA APG) é Cima = aumenta, Baixo = diminui.
      const direction = event.key === 'ArrowUp' ? 1 : -1;
      onDimensionsChange(currentWidth, clampImageHeight(currentHeight + direction * step, naturalHeight));
    }
  }

  return (
    <>
      <div
        ref={widthSliderRef}
        className={styles.imageDimensionSlider}
        role="slider"
        tabIndex={0}
        aria-label="Largura da imagem"
        aria-valuemin={MIN_IMAGE_WIDTH}
        aria-valuemax={effectiveMaxWidth}
        aria-valuenow={currentWidth}
        aria-valuetext={`${currentWidth} pixels de largura`}
        aria-orientation="horizontal"
        onKeyDown={handleWidthKeyDown}
      >
        {currentWidth}px
      </div>
      <div
        ref={heightSliderRef}
        className={styles.imageDimensionSlider}
        role="slider"
        tabIndex={0}
        aria-label="Altura da imagem"
        aria-valuemin={MIN_IMAGE_HEIGHT}
        aria-valuemax={effectiveMaxHeight}
        aria-valuenow={currentHeight}
        aria-valuetext={`${currentHeight} pixels de altura`}
        aria-orientation="vertical"
        onKeyDown={handleHeightKeyDown}
      >
        {currentHeight}px
      </div>
    </>
  );
}
