import { BadRequestException } from '@nestjs/common';
import type { UploadImageBody, UploadImageParams } from '@commerce-platform/contracts';
import type { UploadImageUseCase } from '../application/upload-image.use-case';
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

function buildController(uploadResult: { url: string } = { url: 'https://cdn.example.com/x.jpg' }) {
  const execute = jest.fn().mockResolvedValue(uploadResult);
  const uploadImageUseCase = { execute } as unknown as UploadImageUseCase;
  const controller = new UploadImageController(uploadImageUseCase);

  return { controller, execute };
}

/**
 * Este spec chama `upload(...)` diretamente, sem passar pelo pipeline HTTP
 * do Nest (guards, `ZodValidationPipe`, `FileInterceptor` não são
 * exercitados aqui; cobertura via HTTP real está em
 * `test/upload-image.e2e-spec.ts`, UPL-009). `UploadImageUseCase` é
 * substituído por um fake — este spec cobre só a validação HTTP-adjacente
 * do controller (presença, tamanho, MIME), não a orquestração de storage
 * (coberta em `upload-image.use-case.spec.ts`).
 */
describe('UploadImageController', () => {
  it('sem arquivo: lança BadRequestException("Arquivo não enviado."), nunca chama o use-case', async () => {
    const { controller, execute } = buildController();

    await expect(
      controller.upload(PARAMS, BODY, undefined as unknown as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('arquivo com bytes de GIF (formato não permitido pela UPL-003): lança BadRequestException("Formato de arquivo não permitido.")', async () => {
    const { controller, execute } = buildController();
    const file = buildFile(GIF_BYTES, { originalname: 'foto.gif', mimetype: 'image/gif' });

    await expect(controller.upload(PARAMS, BODY, file)).rejects.toThrow(BadRequestException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('arquivo declara "image/jpeg" no mimetype, mas o conteúdo real é GIF: rejeitado (mimetype do cliente nunca é a fonte da decisão)', async () => {
    const { controller, execute } = buildController();
    // `mimetype: 'image/jpeg'` deliberadamente inconsistente com os bytes
    // reais (GIF) — prova que a validação usa `detectImageMimeType(file.buffer)`,
    // nunca `file.mimetype`.
    const file = buildFile(GIF_BYTES, { mimetype: 'image/jpeg' });

    await expect(controller.upload(PARAMS, BODY, file)).rejects.toThrow(BadRequestException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('arquivo acima do limite de tamanho (assinatura JPEG válida): rejeitado — prova que é a checagem de tamanho, não a de MIME', async () => {
    const { controller, execute } = buildController();
    const file = buildFileWithSize(MAX_IMAGE_SIZE_BYTES + 1);

    await expect(controller.upload(PARAMS, BODY, file)).rejects.toThrow(BadRequestException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('arquivo com tamanho exatamente igual ao limite: não é rejeitado por tamanho (regra é ">", não ">="), delega ao use-case e retorna { url }', async () => {
    const { controller, execute } = buildController({ url: 'https://cdn.example.com/limite.jpg' });
    const file = buildFileWithSize(MAX_IMAGE_SIZE_BYTES);

    await expect(controller.upload(PARAMS, BODY, file)).resolves.toEqual({
      url: 'https://cdn.example.com/limite.jpg',
    });
    expect(execute).toHaveBeenCalledWith({ content: file.buffer, mimeType: 'image/jpeg' });
  });

  it('arquivo com bytes truncados (assinatura incompleta): rejeitado com BadRequestException, nunca uma exceção inesperada', async () => {
    const { controller, execute } = buildController();
    const file = buildFile([0xff, 0xd8]);

    await expect(controller.upload(PARAMS, BODY, file)).rejects.toThrow(BadRequestException);
    expect(execute).not.toHaveBeenCalled();
  });

  it('arquivo com assinatura JPEG válida: delega ao UploadImageUseCase com content/mimeType corretos e retorna { url }', async () => {
    const { controller, execute } = buildController({ url: 'https://cdn.example.com/foto.jpg' });
    const file = buildFile(VALID_JPEG_BYTES);

    const result = await controller.upload(PARAMS, BODY, file);

    expect(result).toEqual({ url: 'https://cdn.example.com/foto.jpg' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ content: file.buffer, mimeType: 'image/jpeg' });
  });
});
