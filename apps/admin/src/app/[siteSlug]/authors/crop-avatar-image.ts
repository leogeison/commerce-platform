/**
 * apps/admin/src/app/[siteSlug]/authors/crop-avatar-image.ts
 *
 * UXP-003 — Cropper de avatar do Autor no Admin.
 *
 * Regras e geração da imagem final do avatar, no navegador. Local ao Admin
 * (único consumidor real: `AvatarCropDialog`/`AuthorForm`); nada aqui
 * conhece API, contrato ou persistência — o arquivo gerado segue o fluxo de
 * upload `AUTHOR_AVATAR` já existente, e a API continua sendo a autoridade
 * de validação (MIME real por magic bytes, 5 MiB, sessão, Role, Site).
 *
 * Decisões do PO (UXP-003):
 * - entrada limitada a JPEG/PNG/WebP e a 5 MiB — o mesmo limite da API,
 *   também para o arquivo ORIGINAL selecionado (não ampliado nesta tarefa);
 * - saída quadrada, até 512×512, nunca ampliando uma área menor;
 * - WebP preferido; se o navegador não codificar WebP e o canvas devolver
 *   PNG, o PNG é aceito como está (a API aceita PNG) — sem segunda
 *   conversão;
 * - avatar reutilizável do Autor: o recorte é um quadrado completo, não
 *   otimizado para o círculo de 40px atual do FastCompre.
 */

export const ACCEPTED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Valor do atributo `accept` do `<input type="file">` do avatar. */
export const AVATAR_FILE_ACCEPT = ACCEPTED_AVATAR_MIME_TYPES.join(',');

/**
 * 5 MiB — espelha `MAX_IMAGE_SIZE_BYTES` de `apps/api/.../upload-policy.ts`
 * (a API não é importável pelo Admin). Checagem client-side só antecipa a
 * mensagem; a API continua aplicando o limite real ao arquivo enviado.
 */
export const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;

export const AVATAR_OUTPUT_MAX_SIZE_PX = 512;

const WEBP_QUALITY = 0.9;

export const AVATAR_UNSUPPORTED_TYPE_MESSAGE = 'Formato de imagem não suportado. Use JPEG, PNG ou WebP.';
export const AVATAR_TOO_LARGE_MESSAGE = 'A imagem deve ter no máximo 5 MB.';
export const AVATAR_CROP_FAILED_MESSAGE = 'Não foi possível gerar a imagem recortada. Tente novamente.';

/** Retorna a mensagem de erro para o arquivo selecionado, ou `null` se válido. */
export function validateAvatarFile(file: File): string | null {
  if (!(ACCEPTED_AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return AVATAR_UNSUPPORTED_TYPE_MESSAGE;
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    return AVATAR_TOO_LARGE_MESSAGE;
  }
  return null;
}

export interface PixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Lado do quadrado de saída: a área recortada (em pixels da imagem
 * original) limitada a 512 — reduz áreas maiores, nunca amplia menores.
 */
export function getAvatarOutputSize(area: PixelArea): number {
  const side = Math.floor(Math.min(area.width, area.height));
  return Math.max(1, Math.min(AVATAR_OUTPUT_MAX_SIZE_PX, side));
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Mesmo limite de posição que `react-easy-crop` aplica ao arrastar e às
 * setas (`restrictPosition`, rotação 0): a imagem nunca deixa espaço vazio
 * dentro da área de recorte. Usado pelos botões de direção (alternativa de
 * ponteiro único ao arraste — WCAG 2.2, 2.5.7), que mudam a posição por
 * fora da biblioteca.
 */
export function clampCropPosition(position: Point, mediaSize: Size, cropSize: Size, zoom: number): Point {
  const clampAxis = (value: number, media: number, crop: number) => {
    const max = Math.abs((media * zoom) / 2 - crop / 2);
    const clamped = Math.min(max, Math.max(-max, value));
    // Normaliza `-0` (limite zero com valor negativo) para `0`.
    return clamped === 0 ? 0 : clamped;
  };
  return {
    x: clampAxis(position.x, mediaSize.width, cropSize.width),
    y: clampAxis(position.y, mediaSize.height, cropSize.height),
  };
}

/**
 * Dependências de navegador injetáveis (jsdom não tem canvas real nem
 * decodificação de imagem). Em produção, `defaultAvatarCropEnvironment`.
 */
export interface AvatarCropEnvironment {
  /** Decodifica a imagem já com a orientação visual que o `<img>` mostra. */
  loadImage: (sourceUrl: string) => Promise<CanvasImageSource>;
  /** Desenha `area` da imagem num quadrado `size`×`size` e codifica. */
  renderToBlob: (image: CanvasImageSource, area: PixelArea, size: number) => Promise<Blob>;
}

/**
 * Decodifica com um `<img>` — o mesmo tipo de elemento que
 * `react-easy-crop` mede para calcular `croppedAreaPixels` (naturalWidth/
 * naturalHeight). Assim, as coordenadas do recorte e o desenho no canvas
 * usam o mesmo sistema de referência, inclusive quanto à orientação EXIF
 * aplicada pelo navegador. A orientação correta não é presumida: é critério
 * de aceite comprovado em browser real (`e2e-a11y/author-avatar-crop.a11y.spec.ts`).
 */
async function loadImageElement(sourceUrl: string): Promise<CanvasImageSource> {
  const image = new Image();
  image.decoding = 'async';
  image.src = sourceUrl;
  await image.decode();
  return image;
}

async function renderCanvasToBlob(image: CanvasImageSource, area: PixelArea, size: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D indisponível.');
  }
  // Sem preenchimento de fundo: WebP e o fallback PNG preservam
  // transparência.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
  // Libera a memória do bitmap do canvas imediatamente.
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) {
    throw new Error('Falha ao codificar a imagem.');
  }
  return blob;
}

export const defaultAvatarCropEnvironment: AvatarCropEnvironment = {
  loadImage: loadImageElement,
  renderToBlob: renderCanvasToBlob,
};

const OUTPUT_EXTENSION: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
};

/**
 * Gera o `File` final do avatar a partir da área recortada. Aceita só
 * WebP (preferido) ou PNG (fallback do próprio canvas quando o navegador
 * não codifica WebP); qualquer outro resultado é tratado como falha.
 * O canvas nunca carrega metadados (EXIF/GPS) da foto original.
 */
export async function cropAvatarImage(
  sourceUrl: string,
  area: PixelArea,
  environment: AvatarCropEnvironment = defaultAvatarCropEnvironment,
): Promise<File> {
  const size = getAvatarOutputSize(area);
  const image = await environment.loadImage(sourceUrl);
  const blob = await environment.renderToBlob(image, area, size);
  const extension = OUTPUT_EXTENSION[blob.type];
  if (!extension) {
    throw new Error(`Formato de saída inesperado: ${blob.type || 'desconhecido'}.`);
  }
  return new File([blob], `avatar.${extension}`, { type: blob.type });
}
