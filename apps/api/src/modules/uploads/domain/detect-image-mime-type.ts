import type { AllowedImageMimeType } from './upload-policy';

/**
 * Assinaturas de arquivo (magic bytes) por formato permitido (UPL-004,
 * conforme a política da UPL-003). Só os três formatos de
 * `ALLOWED_IMAGE_MIME_TYPES` têm checagem — qualquer outro conteúdo (GIF,
 * PDF, texto, etc.) devolve `null` por não bater com nenhuma assinatura
 * conhecida, sem precisar de uma regra de rejeição própria para cada um.
 *
 * - JPEG: `FF D8 FF` (3 primeiros bytes).
 * - PNG: assinatura fixa de 8 bytes `89 50 4E 47 0D 0A 1A 0A`, sem
 *   variação — todo PNG válido começa exatamente assim.
 * - WebP: `"RIFF"` (`52 49 46 46`) nos bytes 0–3 **e** `"WEBP"`
 *   (`57 45 42 50`) nos bytes 8–11. Bytes 4–7 são o tamanho do arquivo
 *   (campo variável do contêiner RIFF) — por isso a checagem "pula" esse
 *   trecho em vez de tratar os 12 primeiros bytes como uma sequência única.
 */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF_MARKER = [0x52, 0x49, 0x46, 0x46];
const WEBP_WEBP_MARKER = [0x57, 0x45, 0x42, 0x50];
const WEBP_WEBP_MARKER_OFFSET = 8;

/**
 * `false` (nunca lança) quando `buffer` é curto demais para conter a
 * assinatura a partir de `offset` — cobre buffers vazios/truncados sem
 * exigir checagem de tamanho antes de cada chamada.
 */
function matchesSignature(buffer: Buffer, signature: number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) {
    return false;
  }

  return signature.every((byte, index) => buffer[offset + index] === byte);
}

/**
 * Detecta o formato real de uma imagem pelo conteúdo binário (magic
 * bytes), nunca por `mimetype`/extensão declarados pelo cliente — esses
 * são dados não confiáveis (Architecture.md, mesmo critério já aplicado à
 * telemetria de Tracking). Só verifica a assinatura; não decodifica nem
 * valida a imagem inteira (fora do escopo da UPL-004).
 *
 * Nunca lança — buffer vazio, truncado ou de conteúdo não reconhecido
 * sempre devolve `null`, nunca uma exceção; decidir o que fazer com
 * `null` (rejeitar a requisição) é responsabilidade de quem chama
 * (`UploadImageController`), não desta função.
 */
export function detectImageMimeType(buffer: Buffer): AllowedImageMimeType | null {
  if (matchesSignature(buffer, JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }

  if (matchesSignature(buffer, PNG_SIGNATURE)) {
    return 'image/png';
  }

  if (
    matchesSignature(buffer, WEBP_RIFF_MARKER) &&
    matchesSignature(buffer, WEBP_WEBP_MARKER, WEBP_WEBP_MARKER_OFFSET)
  ) {
    return 'image/webp';
  }

  return null;
}
