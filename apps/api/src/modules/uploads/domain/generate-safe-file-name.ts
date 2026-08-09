import { randomUUID } from 'node:crypto';
import type { AllowedImageMimeType } from './upload-policy';

/**
 * Extensão de arquivo por MIME type detectado (UPL-004) — nunca pelo
 * `originalname`/extensão declarados pelo cliente, ambos dados não
 * confiáveis. Só cobre os três formatos de `ALLOWED_IMAGE_MIME_TYPES`
 * (UPL-003); a função que chama este mapa só é chamada com um MIME já
 * validado como permitido, então não há caso de formato desconhecido aqui.
 */
const EXTENSION_BY_MIME_TYPE: Record<AllowedImageMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Gera o nome de arquivo que será efetivamente armazenado (UPL-006) —
 * sempre pelo servidor, nunca o nome original enviado pelo cliente
 * (Architecture.md, Seção 29). Base do nome: `randomUUID()` (`node:crypto`,
 * já usado neste projeto para `x-request-id` em
 * `shared/logging/logging.module.ts`) — não `Math.random()` nem timestamp,
 * que teriam garantias de unicidade/imprevisibilidade mais fracas.
 *
 * Extensão derivada apenas do MIME já detectado por assinatura binária
 * (`detectImageMimeType`, UPL-004) — nunca do `originalname` do arquivo
 * enviado.
 *
 * Não decide pasta, prefixo por Site/finalidade nem qualquer estrutura de
 * caminho — isso pertence à `StoragePort`/adaptador (UPL-007/UPL-008),
 * ainda não definidos. Também não está conectada ao
 * `UploadImageController` nesta tarefa: sem uma `StoragePort` para receber
 * esse nome, chamá-la e descartar o resultado seria código morto.
 */
export function generateSafeFileName(mimeType: AllowedImageMimeType): string {
  return `${randomUUID()}${EXTENSION_BY_MIME_TYPE[mimeType]}`;
}
