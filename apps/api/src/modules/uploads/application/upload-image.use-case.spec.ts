import type { StoragePort } from '../domain/storage.port';
import { UploadImageUseCase } from './upload-image.use-case';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildFakeStoragePort(uploadResult: { url: string }) {
  const upload = jest.fn().mockResolvedValue(uploadResult);
  const storagePort = { upload } as unknown as StoragePort;

  return { storagePort, upload };
}

describe('UploadImageUseCase', () => {
  it('gera um fileName com o formato UUID + extensão do MIME e chama StoragePort.upload com content/mimeType repassados', async () => {
    const { storagePort, upload } = buildFakeStoragePort({
      url: 'memory://placeholder',
    });
    const useCase = new UploadImageUseCase(storagePort);
    const content = Buffer.from('fake-image-content');

    await useCase.execute({ content, mimeType: 'image/jpeg' });

    expect(upload).toHaveBeenCalledTimes(1);

    const input = upload.mock.calls[0][0];

    expect(input.content).toBe(content);
    expect(input.mimeType).toBe('image/jpeg');
    expect(input.fileName.endsWith('.jpg')).toBe(true);
    expect(input.fileName.replace(/\.jpg$/, '')).toMatch(UUID_PATTERN);
  });

  it('retorna exatamente o que StoragePort.upload devolveu', async () => {
    const { storagePort } = buildFakeStoragePort({
      url: 'memory://a1b2c3.png',
    });
    const useCase = new UploadImageUseCase(storagePort);

    const result = await useCase.execute({
      content: Buffer.from('x'),
      mimeType: 'image/png',
    });

    expect(result).toEqual({ url: 'memory://a1b2c3.png' });
  });
});
