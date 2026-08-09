import { Inject, Injectable } from '@nestjs/common';
import type { AllowedImageMimeType } from '../domain/upload-policy';
import { generateSafeFileName } from '../domain/generate-safe-file-name';
import { STORAGE_PORT, type StoragePort } from '../domain/storage.port';

export interface UploadImageInput {
  content: Buffer;
  mimeType: AllowedImageMimeType;
}

/**
 * Orquestração da UPL-009: o `UploadImageController` já fez toda a
 * validação HTTP (presença do arquivo, tamanho, MIME real) antes de chegar
 * aqui — este caso de uso só faz o que sobra: gerar o nome seguro
 * (`generateSafeFileName`, UPL-006, função pura) e delegar a gravação à
 * `StoragePort` (UPL-007/UPL-008).
 *
 * Sem variante `{ ok: false }`: se `storagePort.upload` rejeitar (falha de
 * infraestrutura do S3/provedor), a exceção propaga sem tratamento
 * específico até o `AllExceptionsFilter`, que responde `500` genérico —
 * comportamento correto para uma falha de infraestrutura, diferente de um
 * erro de validação (que já teria sido rejeitado antes, no controller, como
 * `400`).
 *
 * `purpose` (do multipart) não entra aqui de propósito: é validado no
 * controller, mas não muda nenhuma política de storage — a UPL-003 decidiu
 * deliberadamente uma política uniforme para `PRODUCT`/`ARTICLE_COVER`/
 * `AUTHOR_AVATAR`. Passá-lo adiante sem uso real seria antecipar um
 * comportamento que não existe ainda.
 */
@Injectable()
export class UploadImageUseCase {
  constructor(@Inject(STORAGE_PORT) private readonly storagePort: StoragePort) {}

  async execute(input: UploadImageInput): Promise<{ url: string }> {
    const fileName = generateSafeFileName(input.mimeType);

    return this.storagePort.upload({
      fileName,
      content: input.content,
      mimeType: input.mimeType,
    });
  }
}
