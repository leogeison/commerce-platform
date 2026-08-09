import type { StoragePort, UploadStorageInput } from './storage.port';

/**
 * Fake em memória, existente apenas para provar que `StoragePort` é
 * testável (critério de aceite da UPL-007) — não é um candidato a
 * adaptador de produção (isso é decisão explícita e separada da UPL-008),
 * por isso vive só aqui dentro do spec, não em `infrastructure/`.
 */
class InMemoryStoragePort implements StoragePort {
  private readonly stored = new Map<string, { content: Buffer; mimeType: string }>();

  async upload(input: UploadStorageInput): Promise<{ url: string }> {
    this.stored.set(input.fileName, { content: input.content, mimeType: input.mimeType });

    return { url: `memory://${input.fileName}` };
  }

  get(fileName: string) {
    return this.stored.get(fileName);
  }
}

describe('StoragePort (contrato, via fake em memória)', () => {
  it('upload armazena os dados recebidos (conteúdo) por fileName', async () => {
    const port = new InMemoryStoragePort();
    const content = Buffer.from('fake-image-content');

    await port.upload({ fileName: 'a1b2c3.jpg', content, mimeType: 'image/jpeg' });

    expect(port.get('a1b2c3.jpg')?.content).toEqual(content);
  });

  it('upload preserva o MIME type recebido', async () => {
    const port = new InMemoryStoragePort();

    await port.upload({
      fileName: 'd4e5f6.webp',
      content: Buffer.from('x'),
      mimeType: 'image/webp',
    });

    expect(port.get('d4e5f6.webp')?.mimeType).toBe('image/webp');
  });

  it('upload retorna uma URL que corresponde ao fileName enviado', async () => {
    const port = new InMemoryStoragePort();

    const result = await port.upload({
      fileName: 'g7h8i9.png',
      content: Buffer.from('y'),
      mimeType: 'image/png',
    });

    expect(result).toEqual({ url: 'memory://g7h8i9.png' });
  });
});
