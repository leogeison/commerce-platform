import { describe, expect, it, jest } from '@jest/globals';
import {
  AVATAR_FILE_ACCEPT,
  AVATAR_MAX_INPUT_BYTES,
  AVATAR_TOO_LARGE_MESSAGE,
  AVATAR_UNSUPPORTED_TYPE_MESSAGE,
  clampCropPosition,
  cropAvatarImage,
  getAvatarOutputSize,
  validateAvatarFile,
  type AvatarCropEnvironment,
  type PixelArea,
} from './crop-avatar-image';

/**
 * UXP-003 — regras puras do recorte de avatar. O desenho real em canvas e a
 * orientação EXIF são verificados em browser real
 * (`e2e-a11y/author-avatar-crop.a11y.spec.ts`); aqui o ambiente de
 * navegador é injetado.
 */

function fileOf(type: string, size = 10): File {
  return new File([new Uint8Array(size)], 'arquivo', { type });
}

function environmentReturning(blob: Blob) {
  const image = {} as CanvasImageSource;
  const loadImage = jest.fn<AvatarCropEnvironment['loadImage']>().mockResolvedValue(image);
  const renderToBlob = jest.fn<AvatarCropEnvironment['renderToBlob']>().mockResolvedValue(blob);
  return { environment: { loadImage, renderToBlob }, image, loadImage, renderToBlob };
}

describe('validateAvatarFile', () => {
  it('aceita JPEG, PNG e WebP dentro do limite', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateAvatarFile(fileOf(type))).toBeNull();
    }
    expect(AVATAR_FILE_ACCEPT).toBe('image/jpeg,image/png,image/webp');
  });

  it('rejeita outros formatos (ex.: GIF, HEIC, SVG)', () => {
    for (const type of ['image/gif', 'image/heic', 'image/svg+xml', '']) {
      expect(validateAvatarFile(fileOf(type))).toBe(AVATAR_UNSUPPORTED_TYPE_MESSAGE);
    }
  });

  it('limite de 5 MiB também no arquivo original: exatamente 5 MiB passa, 1 byte a mais não', () => {
    expect(AVATAR_MAX_INPUT_BYTES).toBe(5 * 1024 * 1024);
    expect(validateAvatarFile(fileOf('image/jpeg', AVATAR_MAX_INPUT_BYTES))).toBeNull();
    expect(validateAvatarFile(fileOf('image/jpeg', AVATAR_MAX_INPUT_BYTES + 1))).toBe(AVATAR_TOO_LARGE_MESSAGE);
  });
});

describe('getAvatarOutputSize', () => {
  it('reduz áreas maiores para 512', () => {
    expect(getAvatarOutputSize({ x: 0, y: 0, width: 3000, height: 3000 })).toBe(512);
  });

  it('nunca amplia uma área menor que 512', () => {
    expect(getAvatarOutputSize({ x: 0, y: 0, width: 300, height: 300 })).toBe(300);
    expect(getAvatarOutputSize({ x: 0, y: 0, width: 299.7, height: 299.7 })).toBe(299);
  });

  it('usa o menor lado (arredondamento subpixel do recorte)', () => {
    expect(getAvatarOutputSize({ x: 0, y: 0, width: 401, height: 400 })).toBe(400);
  });
});

describe('clampCropPosition', () => {
  const media = { width: 300, height: 400 };
  const crop = { width: 300, height: 300 };

  it('zoom 1: só o eixo com sobra permite deslocamento', () => {
    expect(clampCropPosition({ x: 40, y: 80 }, media, crop, 1)).toEqual({ x: 0, y: 50 });
    expect(clampCropPosition({ x: -40, y: -80 }, media, crop, 1)).toEqual({ x: 0, y: -50 });
  });

  it('zoom 2: folga cresce com o zoom', () => {
    expect(clampCropPosition({ x: 500, y: -500 }, media, crop, 2)).toEqual({ x: 150, y: -250 });
    expect(clampCropPosition({ x: 20, y: -20 }, media, crop, 2)).toEqual({ x: 20, y: -20 });
  });
});

describe('cropAvatarImage', () => {
  const area: PixelArea = { x: 100, y: 50, width: 1000, height: 1000 };

  it('gera WebP quadrado de até 512px a partir da área recortada', async () => {
    const { environment, image, loadImage, renderToBlob } = environmentReturning(
      new Blob(['webp'], { type: 'image/webp' }),
    );
    const file = await cropAvatarImage('blob:original', area, environment);

    expect(loadImage).toHaveBeenCalledWith('blob:original');
    // Argumentos comparados um a um (`toHaveBeenCalledWith` com
    // `CanvasImageSource` estoura a inferência de tipos do TS — TS2589).
    const [renderedImage, renderedArea, renderedSize] = renderToBlob.mock.calls[0]!;
    expect(renderedImage).toBe(image);
    expect(renderedArea).toEqual(area);
    expect(renderedSize).toBe(512);
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/webp');
    expect(file.name).toBe('avatar.webp');
  });

  it('aceita PNG como fallback quando o navegador não codifica WebP (sem segunda conversão)', async () => {
    const { environment } = environmentReturning(new Blob(['png'], { type: 'image/png' }));
    const file = await cropAvatarImage('blob:original', { x: 0, y: 0, width: 200, height: 200 }, environment);

    expect(file.type).toBe('image/png');
    expect(file.name).toBe('avatar.png');
  });

  it('não amplia: área de 200px gera saída de 200px', async () => {
    const { environment, renderToBlob } = environmentReturning(new Blob(['webp'], { type: 'image/webp' }));
    await cropAvatarImage('blob:original', { x: 0, y: 0, width: 200, height: 200 }, environment);
    expect(renderToBlob.mock.calls[0]?.[2]).toBe(200);
  });

  it('qualquer outro formato de saída é tratado como falha', async () => {
    const { environment } = environmentReturning(new Blob(['jpg'], { type: 'image/jpeg' }));
    await expect(cropAvatarImage('blob:original', area, environment)).rejects.toThrow('Formato de saída inesperado');
  });

  it('falha ao decodificar a imagem propaga o erro', async () => {
    const environment: AvatarCropEnvironment = {
      loadImage: jest.fn<AvatarCropEnvironment['loadImage']>().mockRejectedValue(new Error('decode')),
      renderToBlob: jest.fn<AvatarCropEnvironment['renderToBlob']>(),
    };
    await expect(cropAvatarImage('blob:original', area, environment)).rejects.toThrow('decode');
    expect(environment.renderToBlob).not.toHaveBeenCalled();
  });
});
