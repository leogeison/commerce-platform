import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  uploadImageBodySchema,
  uploadImageParamsSchema,
  type UploadImageBody,
  type UploadImageParams,
  type UploadImageResponse,
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { UploadImageUseCase } from '../application/upload-image.use-case';
import { detectImageMimeType } from '../domain/detect-image-mime-type';
import { MAX_IMAGE_SIZE_BYTES } from '../domain/upload-policy';

const FILE_NOT_SENT_MESSAGE = 'Arquivo não enviado.';
const FILE_TOO_LARGE_MESSAGE = 'Arquivo excede o tamanho máximo permitido.';
const MIME_TYPE_NOT_ALLOWED_MESSAGE = 'Formato de arquivo não permitido.';

/**
 * `POST /admin/sites/:siteSlug/uploads/images` (UPL-002 a UPL-009;
 * Architecture.md, Seção 29). Registrado em `UploadsModule` (UPL-009) —
 * mesmo papel de fechamento que a TRK-006 teve para o redirect de afiliado:
 * só entrou em um módulo real quando existiu um caminho de sucesso
 * completo (validação + `StoragePort` + resposta `{ url }`).
 *
 * `@UseInterceptors(FileInterceptor('file', { limits: { fileSize: ... } }))`
 * sem `storage`/`dest`: o Multer, sem essas opções, já mantém o arquivo em
 * memória como `Buffer` (`file.buffer`).
 *
 * `limits.fileSize` (UPL-005) é aplicado no próprio parser multipart do
 * Multer: sem esse limite, um payload muito maior que
 * `MAX_IMAGE_SIZE_BYTES` seria inteiramente recebido/bufferizado antes de
 * qualquer checagem nossa rejeitá-lo. Quando o Multer excede esse limite,
 * ele emite `LIMIT_FILE_SIZE`, que o `FileInterceptor` converte em
 * `PayloadTooLargeException` (413) — tratada pelo `AllExceptionsFilter`
 * exatamente como qualquer outra `HttpException`.
 *
 * `purpose` (campo de texto do multipart) validado via
 * `uploadImageBodySchema`, mas não repassado ao `UploadImageUseCase`
 * (UPL-009): a política de validação já é deliberadamente uniforme entre
 * `PRODUCT`/`ARTICLE_COVER`/`AUTHOR_AVATAR` (UPL-003) — `purpose` existe só
 * para o cliente saber em qual campo aplicar a URL retornada.
 *
 * Guards na mesma ordem de `RemoveProductController`/`RemoveOfferController`:
 * `OriginGuard` (mutação, `POST`) antes de sessão/banco, `SiteAuthorizationGuard`
 * por último. `@MinRole('EDITOR')`: Role mínima documentada no Architecture.md
 * §29. `@HttpCode(201)`: mesma convenção de toda criação de recurso no
 * projeto (`CategoriesController.create`, `ProductsController`, etc.).
 *
 * Corpo do método: presença do arquivo (UPL-002) → tamanho (`file.size >
 * MAX_IMAGE_SIZE_BYTES`, UPL-005, comparação estritamente `>`, defesa em
 * profundidade complementar ao limite do Multer acima) → MIME real por
 * assinatura binária (`detectImageMimeType`, UPL-004 — nunca por
 * `file.mimetype`/extensão, dados não confiáveis do cliente) → delega ao
 * `UploadImageUseCase` (nome seguro + `StoragePort`, UPL-006/007/008) e
 * retorna `{ url }` (UPL-009).
 */
@Controller('admin/sites/:siteSlug/uploads')
export class UploadImageController {
  constructor(private readonly uploadImageUseCase: UploadImageUseCase) {}

  @Post('images')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } }))
  async upload(
    // `_params`/`_body`: `_body.purpose` é validado pelo Zod, mas não lido
    // no corpo do método (ver comentário da classe) — prefixo `_` só
    // satisfaz `noUnusedParameters` (tsconfig.base.json).
    @Param(new ZodValidationPipe(uploadImageParamsSchema))
    _params: UploadImageParams,
    @Body(new ZodValidationPipe(uploadImageBodySchema))
    _body: UploadImageBody,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadImageResponse> {
    if (!file) {
      throw new BadRequestException(FILE_NOT_SENT_MESSAGE);
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException(FILE_TOO_LARGE_MESSAGE);
    }

    const detectedMimeType = detectImageMimeType(file.buffer);

    if (!detectedMimeType) {
      throw new BadRequestException(MIME_TYPE_NOT_ALLOWED_MESSAGE);
    }

    return this.uploadImageUseCase.execute({
      content: file.buffer,
      mimeType: detectedMimeType,
    });
  }
}
