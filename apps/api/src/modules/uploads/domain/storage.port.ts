import type { AllowedImageMimeType } from './upload-policy';

/**
 * `StoragePort` (UPL-007; Architecture.md, Seção 29) — interface abstrata
 * para gravar um arquivo e obter a URL pública correspondente, sem
 * presumir nenhum provedor concreto (disco local, S3-compatível,
 * Cloudflare R2, etc.). O adaptador concreto é uma decisão à parte,
 * pendente (UPL-008).
 *
 * Uma única operação (`upload`), não `save()` + `getPublicUrl()`
 * separados: não há entidade `Media` neste projeto (Seção 29) — a URL
 * retornada é gravada direto no campo do recurso (`imageUrl`/
 * `coverImageUrl`/`avatarUrl`) e nunca mais é re-derivada depois a partir
 * de um arquivo já armazenado. Sem esse caso de uso, uma porta com duas
 * capacidades separadas adicionaria uma operação sem consumidor real.
 *
 * `fileName` já vem pronto de `generateSafeFileName` (UPL-006) — é a
 * própria chave de armazenamento; como o adaptador mapeia essa chave para
 * um local físico (pasta, bucket, prefixo por Site/finalidade) é decisão
 * do adaptador concreto (UPL-008), não desta porta. Por isso a porta não
 * recebe `siteId`, `purpose`, bucket, pasta ou prefixo.
 */
export const STORAGE_PORT = Symbol('StoragePort');

export interface UploadStorageInput {
  fileName: string;
  content: Buffer;
  mimeType: AllowedImageMimeType;
}

export interface StoragePort {
  upload(input: UploadStorageInput): Promise<{ url: string }>;
}
