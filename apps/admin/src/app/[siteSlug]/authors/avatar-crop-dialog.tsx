'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject, type SyntheticEvent } from 'react';
import Cropper, { type Area, type MediaSize, type Point, type Size } from 'react-easy-crop';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Loader2, Minus, Plus } from 'lucide-react';
import { Button, Text } from '@commerce-platform/ui';
import { AVATAR_CROP_FAILED_MESSAGE, clampCropPosition, cropAvatarImage, type PixelArea } from './crop-avatar-image';

/**
 * apps/admin/src/app/[siteSlug]/authors/avatar-crop-dialog.tsx
 *
 * UXP-003 — Cropper de avatar do Autor no Admin.
 *
 * Diálogo modal de recorte 1:1 com prévia circular. `<dialog>` nativo com
 * `showModal()` — mesmo precedente do diálogo de alterações não salvas
 * (`unsaved-changes-context.tsx`): o navegador torna o resto da página
 * inerte (foco preso no diálogo), dispara `cancel` no Escape e devolve o
 * foco ao fechar. O retorno de foco ainda é feito explicitamente para
 * `returnFocusRef` (campo de arquivo ou "Ajustar recorte"), para não
 * depender de onde o navegador deixou o foco depois do seletor de arquivo.
 *
 * Interação (react-easy-crop): arrastar com mouse/toque, pinça, roda do
 * mouse e setas do teclado na área de recorte (Shift = passo fino). Zoom de
 * 1 a 3 também por `<input type="range">` rotulado e por botões. Os quatro
 * botões de direção são a alternativa de ponteiro único ao arraste exigida
 * pela WCAG 2.2, critério 2.5.7. Nada aqui persiste coordenadas: o
 * resultado é só o `File` final, entregue a `onApply`.
 *
 * UXP-003 (ajustes finais):
 * - retomar enquadramento: `initialCroppedAreaPixels` (área do último
 *   recorte aplicado, em pixels da imagem ORIGINAL, mantida só em memória
 *   pelo `AuthorForm`) é repassada ao react-easy-crop, que recalcula posição
 *   e zoom para o tamanho atual do diálogo — equivalente mesmo se o diálogo
 *   reabrir maior ou menor. "Restaurar enquadramento" continua voltando ao
 *   centro com zoom 1. `onApply` devolve a área usada junto com o arquivo.
 * - cancelamento durante a geração: Cancelar/Escape ficam disponíveis
 *   enquanto a imagem é gerada. Cada geração recebe um identificador; ao
 *   cancelar (ou desmontar), o identificador corrente é invalidado e o
 *   resultado ou erro que chegar depois é descartado — nunca chama
 *   `onApply` nem altera o estado.
 *
 * O dono do ciclo de vida da URL local da imagem original é o
 * `AuthorForm` (cria ao abrir, revoga ao fechar) — este componente só a
 * lê, sem `URL.createObjectURL` em efeito (evita a revogação dupla do
 * StrictMode em desenvolvimento).
 */

export const AVATAR_MIN_ZOOM = 1;
export const AVATAR_MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const MOVE_STEP_PX = 10;
const KEYBOARD_STEP_PX = 10;
const FOCUS_RETRY_FRAMES = 30;

const INITIAL_CROP: Point = { x: 0, y: 0 };

const ICON_BUTTON_CLASSES =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-outline bg-surface text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:cursor-not-allowed disabled:opacity-50';

export interface AvatarCropDialogProps {
  /** URL local (`blob:`) da imagem original selecionada. */
  imageUrl: string;
  /** Elemento que recebe o foco quando o diálogo fecha. */
  returnFocusRef: RefObject<HTMLElement | null>;
  /**
   * Área do último recorte aplicado (pixels da imagem original), para
   * retomar o enquadramento em "Ajustar recorte". Só em memória.
   */
  initialCroppedAreaPixels?: PixelArea | null;
  /** Arquivo final e a área (pixels da imagem original) usada para gerá-lo. */
  onApply: (croppedFile: File, croppedAreaPixels: PixelArea) => void;
  onCancel: () => void;
}

type Status = 'editing' | 'processing' | 'load-error' | 'crop-error';

function clampZoom(value: number): number {
  return Math.min(AVATAR_MAX_ZOOM, Math.max(AVATAR_MIN_ZOOM, value));
}

/** Zoom dos controles próprios (range/botões): passos de 0,1. */
function stepZoom(value: number): number {
  return clampZoom(Math.round(value * 10) / 10);
}

/**
 * Prévia circular do resultado: a mesma imagem como fundo, posicionada pela
 * área recortada em porcentagem (`croppedArea` do react-easy-crop) — sem
 * canvas, então acompanha cada movimento sem custo de codificação.
 */
function previewStyle(imageUrl: string, area: Area | null): CSSProperties | undefined {
  if (!area || area.width <= 0 || area.height <= 0) {
    return undefined;
  }
  const scale = 100 / area.width;
  const positionX = area.width >= 100 ? 0 : (area.x / (100 - area.width)) * 100;
  const positionY = area.height >= 100 ? 0 : (area.y / (100 - area.height)) * 100;
  return {
    backgroundImage: `url("${imageUrl}")`,
    backgroundSize: `${scale * 100}% auto`,
    backgroundPosition: `${positionX}% ${positionY}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export function AvatarCropDialog({
  imageUrl,
  returnFocusRef,
  initialCroppedAreaPixels,
  onApply,
  onCancel,
}: AvatarCropDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Objeto de ref entregue pelo react-easy-crop (`setCropperRef`); o
  // `.current` só existe depois que a área de recorte é renderizada.
  const cropAreaRef = useRef<RefObject<HTMLDivElement | null> | null>(null);
  const hasFocusedCropAreaRef = useRef(false);
  // Identificador da geração corrente; incrementado para invalidar
  // gerações canceladas (ou ao desmontar).
  const operationIdRef = useRef(0);

  const [crop, setCrop] = useState<Point>(INITIAL_CROP);
  const [zoom, setZoom] = useState(AVATAR_MIN_ZOOM);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<PixelArea | null>(null);
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);
  const [cropSize, setCropSize] = useState<Size | null>(null);
  const [status, setStatus] = useState<Status>('editing');

  const headingId = useId();
  const instructionsId = useId();
  const zoomId = useId();

  const isProcessing = status === 'processing';
  const isReady = mediaSize !== null && cropSize !== null && status !== 'load-error';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      // Foco inicial no título até a área de recorte existir (ela depende
      // da imagem carregar); depois, `focusCropAreaOnce` move para ela.
      headingRef.current?.focus();
    }
    return () => {
      // Qualquer geração ainda pendente passa a ser descartada.
      operationIdRef.current += 1;
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  /**
   * Foco inicial: a área de recorte, assim que existe. Ela só é renderizada
   * pela biblioteca depois que a imagem carrega e o tamanho do recorte é
   * calculado — o momento exato varia, então a tentativa se repete a cada
   * quadro (até `FOCUS_RETRY_FRAMES`) em vez de depender de um único
   * `requestAnimationFrame`. A primeira tentativa também é adiada um quadro,
   * para nunca acontecer antes do `showModal()` (que foca o título).
   * Nunca rouba o foco se o usuário já moveu para outro controle.
   */
  function scheduleCropAreaFocus() {
    requestAnimationFrame(() => focusCropAreaOnce(0));
  }

  function focusCropAreaOnce(attempt: number) {
    if (hasFocusedCropAreaRef.current) {
      return;
    }
    const cropArea = cropAreaRef.current?.current;
    if (!cropArea) {
      if (attempt < FOCUS_RETRY_FRAMES) {
        requestAnimationFrame(() => focusCropAreaOnce(attempt + 1));
      }
      return;
    }
    hasFocusedCropAreaRef.current = true;
    const active = document.activeElement;
    if (!active || active === document.body || active === headingRef.current || active === dialogRef.current) {
      cropArea.focus();
    }
  }

  function closeAndRestoreFocus() {
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
    returnFocusRef.current?.focus();
  }

  function handleCancel() {
    // Permitido também durante a geração: invalida a operação pendente, cujo
    // resultado (ou erro) será descartado quando chegar.
    operationIdRef.current += 1;
    closeAndRestoreFocus();
    onCancel();
  }

  function handleDialogCancelEvent(event: SyntheticEvent<HTMLDialogElement>) {
    // Escape: o fechamento é sempre controlado aqui (nunca o fechamento
    // nativo direto), para manter o estado do formulário como fonte única.
    event.preventDefault();
    handleCancel();
  }

  async function handleApply() {
    if (!croppedAreaPixels || isProcessing) {
      return;
    }
    const operationId = (operationIdRef.current += 1);
    const area = croppedAreaPixels;
    setStatus('processing');
    try {
      const file = await cropAvatarImage(imageUrl, area);
      if (operationId !== operationIdRef.current) {
        return; // cancelada ou substituída: descarta o resultado
      }
      closeAndRestoreFocus();
      onApply(file, area);
    } catch {
      if (operationId !== operationIdRef.current) {
        return; // cancelada: descarta o erro
      }
      setStatus('crop-error');
    }
  }

  function updateCroppedArea(area: Area, areaPixels: Area) {
    setCroppedArea(area);
    setCroppedAreaPixels(areaPixels);
  }

  function changeZoom(next: number) {
    const nextZoom = stepZoom(next);
    setZoom(nextZoom);
    if (mediaSize && cropSize) {
      setCrop((current) => clampCropPosition(current, mediaSize, cropSize, nextZoom));
    }
  }

  function moveImage(deltaX: number, deltaY: number) {
    if (!mediaSize || !cropSize) {
      return;
    }
    setCrop((current) => clampCropPosition({ x: current.x + deltaX, y: current.y + deltaY }, mediaSize, cropSize, zoom));
  }

  function resetFraming() {
    setZoom(AVATAR_MIN_ZOOM);
    setCrop(INITIAL_CROP);
  }

  const controlsDisabled = !isReady || isProcessing;
  const zoomPercent = Math.round(zoom * 100);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      aria-describedby={instructionsId}
      onCancel={handleDialogCancelEvent}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),44rem)] overflow-y-auto rounded-control border border-outline bg-surface p-4 font-ui text-fg backdrop:bg-[rgb(0_0_0/0.5)] sm:p-6"
    >
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="m-0 text-lg font-semibold outline-none">
        Recortar avatar
      </h2>
      <Text id={instructionsId} variant="body-sm" tone="muted" className="mb-4 mt-1">
        Arraste a imagem ou use as setas do teclado na área de recorte para posicioná-la. Use o zoom para aproximar.
        O resultado é um avatar quadrado; o círculo mostra como ele costuma aparecer.
      </Text>

      <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_13rem] sm:gap-6">
        <div className="relative aspect-square w-full overflow-hidden rounded-control bg-subtle-surface">
          {status === 'load-error' ? (
            <Text role="alert" tone="danger" variant="body-sm" className="m-0 p-4">
              Não foi possível abrir esta imagem. Escolha outro arquivo.
            </Text>
          ) : (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              objectFit="cover"
              minZoom={AVATAR_MIN_ZOOM}
              maxZoom={AVATAR_MAX_ZOOM}
              keyboardStep={KEYBOARD_STEP_PX}
              onCropChange={setCrop}
              // Sem arredondar: preserva o zoom exato vindo de pinça, roda e
              // da restauração por `initialCroppedAreaPixels`.
              onZoomChange={(value) => setZoom(clampZoom(value))}
              initialCroppedAreaPixels={initialCroppedAreaPixels ?? undefined}
              // `onCropComplete` só dispara ao fim de uma interação da
              // própria biblioteca (mouse/toque/roda/tecla); `onCropAreaChange`
              // também cobre mudanças feitas por fora (botões de direção,
              // zoom pelo range/botões, Restaurar). Os dois alimentam a mesma
              // área — a prévia e o "Aplicar recorte" nunca usam uma área
              // desatualizada.
              onCropComplete={updateCroppedArea}
              onCropAreaChange={updateCroppedArea}
              onMediaLoaded={setMediaSize}
              onCropSizeChange={(size) => {
                setCropSize(size);
                // A área de recorte é criada em seguida pela biblioteca.
                scheduleCropAreaFocus();
              }}
              setCropperRef={(ref) => {
                cropAreaRef.current = ref;
              }}
              mediaProps={{ alt: '', onError: () => setStatus('load-error') }}
              // `className` NUNCA em `cropperProps`: a biblioteca espalha
              // `cropperProps` por último e um `className` ali substituiria
              // as classes dela (`reactEasyCrop_CropArea`/`…Round`),
              // quebrando posição e máscara. Foco visível por `outline`, não
              // `ring`: o `ring` do Tailwind usa `box-shadow`, a mesma
              // propriedade da máscara escura da área de recorte.
              classes={{
                cropAreaClassName:
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              }}
              cropperProps={{
                role: 'group',
                'aria-label': 'Área de recorte: use as setas para mover a imagem',
                'aria-describedby': instructionsId,
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2">
            <div
              role="img"
              aria-label="Prévia do avatar recortado"
              className="h-24 w-24 shrink-0 overflow-hidden rounded-pill border border-outline bg-subtle-surface"
              style={previewStyle(imageUrl, croppedArea)}
            />
            <Text variant="body-sm" tone="muted" className="m-0" aria-hidden="true">
              Prévia
            </Text>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={zoomId} className="text-body-sm font-action">
              Zoom
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={ICON_BUTTON_CLASSES}
                aria-label="Diminuir zoom"
                onClick={() => changeZoom(zoom - ZOOM_STEP)}
                disabled={controlsDisabled || zoom <= AVATAR_MIN_ZOOM}
              >
                <Minus aria-hidden="true" className="h-4 w-4" />
              </button>
              <input
                id={zoomId}
                type="range"
                min={AVATAR_MIN_ZOOM}
                max={AVATAR_MAX_ZOOM}
                step={ZOOM_STEP}
                value={zoom}
                aria-valuetext={`${zoomPercent}%`}
                onChange={(event) => changeZoom(Number(event.target.value))}
                disabled={controlsDisabled}
                className="h-11 min-w-0 flex-1 accent-[var(--color-accent-fill-default)]"
              />
              <button
                type="button"
                className={ICON_BUTTON_CLASSES}
                aria-label="Aumentar zoom"
                onClick={() => changeZoom(zoom + ZOOM_STEP)}
                disabled={controlsDisabled || zoom >= AVATAR_MAX_ZOOM}
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div role="group" aria-label="Mover imagem" className="grid grid-cols-3 justify-items-center gap-1 self-center">
            <span aria-hidden="true" />
            <button
              type="button"
              className={ICON_BUTTON_CLASSES}
              aria-label="Mover imagem para cima"
              onClick={() => moveImage(0, -MOVE_STEP_PX)}
              disabled={controlsDisabled}
            >
              <ArrowUp aria-hidden="true" className="h-4 w-4" />
            </button>
            <span aria-hidden="true" />
            <button
              type="button"
              className={ICON_BUTTON_CLASSES}
              aria-label="Mover imagem para a esquerda"
              onClick={() => moveImage(-MOVE_STEP_PX, 0)}
              disabled={controlsDisabled}
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <span aria-hidden="true" />
            <button
              type="button"
              className={ICON_BUTTON_CLASSES}
              aria-label="Mover imagem para a direita"
              onClick={() => moveImage(MOVE_STEP_PX, 0)}
              disabled={controlsDisabled}
            >
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
            <span aria-hidden="true" />
            <button
              type="button"
              className={ICON_BUTTON_CLASSES}
              aria-label="Mover imagem para baixo"
              onClick={() => moveImage(0, MOVE_STEP_PX)}
              disabled={controlsDisabled}
            >
              <ArrowDown aria-hidden="true" className="h-4 w-4" />
            </button>
            <span aria-hidden="true" />
          </div>

          <Button type="button" variant="secondary" size="sm" onClick={resetFraming} disabled={controlsDisabled}>
            Restaurar enquadramento
          </Button>
        </div>
      </div>

      {status === 'processing' && (
        <p role="status" className="mt-4 flex items-center gap-2 text-body-sm">
          <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
          Gerando imagem recortada...
        </p>
      )}
      {status === 'crop-error' && (
        <Text role="alert" tone="danger" variant="body-sm" className="mb-0 mt-4">
          {AVATAR_CROP_FAILED_MESSAGE}
        </Text>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={handleCancel}>
          Cancelar
        </Button>
        <Button type="button" onClick={handleApply} disabled={!isReady || !croppedAreaPixels || isProcessing}>
          Aplicar recorte
        </Button>
      </div>
    </dialog>
  );
}
