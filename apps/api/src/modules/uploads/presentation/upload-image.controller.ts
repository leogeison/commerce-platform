import {
  BadRequestException,
  Body,
  Controller,
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
} from '@commerce-platform/contracts';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import { detectImageMimeType } from '../domain/detect-image-mime-type';
import { MAX_IMAGE_SIZE_BYTES } from '../domain/upload-policy';

const FILE_NOT_SENT_MESSAGE = 'Arquivo não enviado.';
const FILE_TOO_LARGE_MESSAGE = 'Arquivo excede o tamanho máximo permitido.';
const MIME_TYPE_NOT_ALLOWED_MESSAGE = 'Formato de arquivo não permitido.';

/**
 * `POST /admin/sites/:siteSlug/uploads/images` (UPL-002; Architecture.md,
 * Seção 29). **Ainda não registrado em nenhum módulo** — mesmo padrão de
 * `AffiliateRedirectController` entre TRK-002 e TRK-005: constrói o método
 * incrementalmente ao longo de UPL-002 a UPL-009, sem nunca expor um
 * caminho de sucesso inventado. Falta, nas próximas tarefas: validação real
 * de MIME (UPL-004) e tamanho (UPL-005) conforme a decisão da UPL-003,
 * nome de arquivo seguro (UPL-006), gravação via `StoragePort`/adaptador
 * (UPL-007/UPL-008) e a resposta `{ url }` (UPL-009) — só quando essa
 * última existir de verdade é que o controller entra em algum módulo real
 * (mesmo papel de fechamento que a TRK-006 teve para o redirect).
 *
 * `@UseInterceptors(FileInterceptor('file', { limits: { fileSize: ... } }))`
 * sem `storage`/`dest`: o Multer, sem essas opções, já mantém o arquivo em
 * memória como `Buffer` (`file.buffer`) — nenhuma configuração adicional
 * necessária, e principalmente nenhuma escrita em disco decidida aqui, o
 * que anteciparia a `StoragePort` (UPL-007), ainda não definida.
 *
 * `limits.fileSize` (UPL-005) é aplicado no próprio parser multipart do
 * Multer, não só depois no controller: como o arquivo fica em memória
 * (Buffer), sem esse limite um payload muito maior que
 * `MAX_IMAGE_SIZE_BYTES` seria inteiramente recebido/bufferizado antes de
 * qualquer checagem nossa rejeitá-lo. Quando o Multer excede esse limite,
 * ele emite o erro `LIMIT_FILE_SIZE`, que o próprio `FileInterceptor` do
 * `@nestjs/platform-express` converte em `PayloadTooLargeException` (413) —
 * uma `HttpException` real, tratada pelo `AllExceptionsFilter` (`@Catch()`
 * genérico) exatamente como qualquer outra exceção HTTP da aplicação, sem
 * risco de virar um 500 não tratado. Não foi necessário criar nenhum
 * exception filter novo. Esse caminho (413) tem corpo/mensagem no formato
 * padrão do Multer, diferente da mensagem em português usada pela checagem
 * defensiva abaixo — aceito nesta tarefa, já que cobre o cenário de abuso
 * (payload muito acima do limite) e não o caso comum de um arquivo só
 * moderadamente grande.
 *
 * `purpose` (campo de texto do multipart) validado via
 * `uploadImageBodySchema` (UPL-002, contratos) — mesmo mecanismo de
 * `@Body(new ZodValidationPipe(...))` usado em todo o projeto; o Multer
 * popula `req.body` com os campos de texto antes do pipe rodar. O arquivo
 * em si nunca passa pelo Zod (não há como validar um `Buffer` de forma
 * útil com schema de runtime) — chega via `@UploadedFile()`, tipado como
 * `Express.Multer.File` (`@types/multer`, dependência nova desta tarefa,
 * só para o tipo — o pacote `multer` em si já é transitivo de
 * `@nestjs/platform-express`).
 *
 * Guards na mesma ordem de `RemoveProductController`/`RemoveOfferController`:
 * `OriginGuard` (mutação, `POST`) antes de sessão/banco, `SiteAuthorizationGuard`
 * por último. `@MinRole('EDITOR')`: Role mínima documentada no Architecture.md
 * §29 para este endpoint.
 *
 * Corpo do método, até a UPL-005: confirma que o multipart trouxe um
 * arquivo (UPL-002); em seguida, checagem defensiva de tamanho
 * (`file.size > MAX_IMAGE_SIZE_BYTES`, UPL-005) — redundante com o limite
 * do Multer acima em condições normais (o parser já teria rejeitado antes),
 * mas mantida por defesa em profundidade e por dar a mensagem em português
 * padronizada da API em vez do 413 genérico do Multer, para o caso comum de
 * um arquivo só um pouco acima do limite; comparação estritamente `>`, não
 * `>=` — um arquivo exatamente em `MAX_IMAGE_SIZE_BYTES` é permitido.
 * Comparação simples o bastante (uma linha) para não justificar uma função
 * dedicada em `uploads/domain`, ao contrário do MIME (UPL-004), que é
 * lógica genuinamente não trivial. Por fim, detecta o formato real por
 * assinatura binária (`detectImageMimeType`, UPL-004, `uploads/domain` —
 * função pura, sem HTTP) — nunca por `file.mimetype`/extensão do nome
 * original, ambos dados não confiáveis declarados pelo cliente; esta tarefa
 * não exige que `file.mimetype` bata com o formato detectado, só que o
 * conteúdo real seja um dos formatos permitidos
 * (`ALLOWED_IMAGE_MIME_TYPES`, UPL-003). Nome seguro e armazenamento
 * continuam nas tarefas seguintes.
 */
@Controller('admin/sites/:siteSlug/uploads')
export class UploadImageController {
  @Post('images')
  @UseGuards(OriginGuard, SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } }))
  async upload(
    // `_params`/`_body`: não lidos nesta etapa (nada além da presença do
    // arquivo é verificado ainda), mas os decorators seguem reais — a
    // validação via `ZodValidationPipe` roda no pipeline HTTP do Nest
    // independente de o parâmetro ser referenciado no corpo do método.
    // Prefixo `_` só satisfaz `noUnusedParameters` (tsconfig.base.json).
    @Param(new ZodValidationPipe(uploadImageParamsSchema))
    _params: UploadImageParams,
    @Body(new ZodValidationPipe(uploadImageBodySchema))
    _body: UploadImageBody,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<void> {
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

    // Nome seguro (UPL-006), gravação via StoragePort (UPL-007/UPL-008) e
    // resposta `{ url }` (UPL-009) — fora do escopo desta tarefa.
  }
}
