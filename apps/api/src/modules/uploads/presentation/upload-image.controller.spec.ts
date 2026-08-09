import { BadRequestException } from '@nestjs/common';
import type { UploadImageBody, UploadImageParams } from '@commerce-platform/contracts';
import { MAX_IMAGE_SIZE_BYTES } from '../domain/upload-policy';
import { UploadImageController } from './upload-image.controller';

const PARAMS: UploadImageParams = { siteSlug: 'loja-a' };
const BODY: UploadImageBody = { purpose: 'PRODUCT' };

const VALID_JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];
const GIF_BYTES = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

function buildFile(
  bytes: number[],
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  const buffer = Buffer.from(bytes);

  return {
    buffer,
    originalname: 'foto.jpg',
    mimetype: 'image/jpeg',
    size: buffer.length,
    ...overrides,
  } as Express.Multer.File;
}

/**
 * `size` sobrescrito manualmente (independente do tamanho real do
 * `buffer`) para exercitar a checagem defensiva de tamanho do controller
 * (UPL-005) isoladamente — em produção quem popula `file.size` é o Multer,
 * mas aqui simulamos os valores de fronteira sem precisar de um buffer de
 * verdade com megabytes de conteúdo.
 */
function buildFileWithSize(size: number): Express.Multer.File {
  return buildFile(VALID_JPEG_BYTES, { size });
}

/**
 * `UploadImageController` ainda não está registrado em nenhum módulo —
 * este spec chama `upload(...)` diretamente, sem passar pelo pipeline HTTP
 * do Nest (guards, `ZodValidationPipe`, `FileInterceptor` não são
 * exercitados aqui; cobertura real deles só existe quando a rota for
 * registrada, na UPL-009, via e2e).
 *
 * Cobre as regras que já pertencem às tarefas concluídas: ausência de
 * arquivo (UPL-002), tamanho acima do limite (UPL-005 — checagem
 * defensiva do controller; o limite do Multer em si, `limits.fileSize`,
 * não é exercitado aqui por não passar pelo pipeline HTTP real, ver
 * comentário do controller) e formato não reconhecido por assinatura
 * binária (UPL-004). O caso "arquivo válido chega até o fim do método" não é
 * testado como comportamento funcional definitivo — nesta etapa o método
 * ainda não valida tamanho, gera nome seguro nem armazena nada (UPL-005 em
 * diante), então não há resposta HTTP real para verificar; o teste apenas
 * prova que um arquivo com assinatura válida passa pelas checagens
 * existentes até aqui sem lançar.
 */
describe('UploadImageController', () => {
  it('sem arquivo: lança BadRequestException("Arquivo não enviado.")', async () => {
    const controller = new UploadImageController();

    await expect(
      controller.upload(PARAMS, BODY, undefined as unknown as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
  });

  it('arquivo com bytes de GIF (formato não permitido pela UPL-003): lança BadRequestException("Formato de arquivo não permitido.")', async () => {
    const controller = new UploadImageController();
    const file = buildFile(GIF_BYTES, { originalname: 'foto.gif', mimetype: 'image/gif' });

    await expect(controller.upload(PARAMS, BODY, file)).rejects.toThrow(BadRequestException);
  });

  it('arquivo declara "image/jpeg" no mimetype, mas o conteúdo real é GIF: rejeitado (mimetype do cliente nunca é a fonte da decisão)', async () => {
    const controller = new UploadImageController();
    // `mimetype: 'image/jpeg'` deliberadamente inconsistente com os bytes
    // reais (GIF) — prova que a validação usa `detectImageMimeType(file.buffer)`,
    // nunca `file.mimetype`.
    const file = buildFile(GIF_BYTES, { mimetype: 'image/jpeg' });

    await expect(controller.upload(PARAMS, BODY, file)).rejects.toThrow(BadRequestException);
  });

  it('arquivo acima do limite de tamanho (assinatura JPEG válida): rejeitado — prova que é a checagem de tamanho, não a de MIME', async () => {
    const controller = new UploadImageController();
    const file = buildFileWithSize(MAX_IMAGE_SIZE_BYTES + 1);

    await expect(controller.upload(PARAMS, BODY, file)).rejects.toThrow(BadRequestException);
  });

  it('arquivo com tamanho exatamente igual ao limite: não é rejeitado por tamanho (regra é ">", não ">=")', async () => {
    const controller = new UploadImageController();
    const file = buildFileWithSize(MAX_IMAGE_SIZE_BYTES);

    await expect(controller.upload(PARAMS, BODY, file)).resolves.toBeUndefined();
  });

  it('arquivo com bytes truncados (assinatura incompleta): rejeitado com BadRequestException, nunca uma exceção inesperada', async () => {
    const controller = new UploadImageController();
    const file = buildFile([0xff, 0xd8]);

    await expect(controller.upload(PARAMS, BODY, file)).rejects.toThrow(BadRequestException);
  });

  it('arquivo com assinatura JPEG válida: não lança (só prova a delegação estrutural até esta etapa, não uma resposta HTTP)', async () => {
    const controller = new UploadImageController();
    const file = buildFile(VALID_JPEG_BYTES);

    await expect(controller.upload(PARAMS, BODY, file)).resolves.toBeUndefined();
  });
});
