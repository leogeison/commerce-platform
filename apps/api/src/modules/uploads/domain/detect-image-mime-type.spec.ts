import { detectImageMimeType } from './detect-image-mime-type';

function bytes(values: number[]): Buffer {
  return Buffer.from(values);
}

describe('detectImageMimeType', () => {
  it('JPEG válido (FF D8 FF + payload): image/jpeg', () => {
    const buffer = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    expect(detectImageMimeType(buffer)).toBe('image/jpeg');
  });

  it('PNG válido (assinatura completa de 8 bytes + payload): image/png', () => {
    const buffer = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

    expect(detectImageMimeType(buffer)).toBe('image/png');
  });

  it('WebP válido (RIFF nos bytes 0-3, WEBP nos bytes 8-11): image/webp', () => {
    // bytes 4-7 = tamanho do arquivo (RIFF), valor arbitrário — não faz
    // parte da assinatura verificada.
    const buffer = bytes([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);

    expect(detectImageMimeType(buffer)).toBe('image/webp');
  });

  it('GIF (GIF89a), formato não permitido pela UPL-003: null', () => {
    const buffer = bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

    expect(detectImageMimeType(buffer)).toBeNull();
  });

  it('buffer vazio: null, sem lançar', () => {
    expect(detectImageMimeType(Buffer.alloc(0))).toBeNull();
  });

  it('conteúdo aleatório/desconhecido: null', () => {
    const buffer = bytes([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);

    expect(detectImageMimeType(buffer)).toBeNull();
  });

  it('JPEG truncado (só 2 dos 3 bytes da assinatura): null, sem lançar', () => {
    const buffer = bytes([0xff, 0xd8]);

    expect(detectImageMimeType(buffer)).toBeNull();
  });

  it('PNG truncado (7 dos 8 bytes da assinatura): null, sem lançar', () => {
    const buffer = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a]);

    expect(detectImageMimeType(buffer)).toBeNull();
  });

  it('WebP truncado (RIFF presente, mas curto demais para o marcador WEBP): null, sem lançar', () => {
    const buffer = bytes([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00]);

    expect(detectImageMimeType(buffer)).toBeNull();
  });

  it('WebP com RIFF, mas marcador nos bytes 8-11 incorreto: null', () => {
    const buffer = bytes([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20,
    ]);

    expect(detectImageMimeType(buffer)).toBeNull();
  });
});
