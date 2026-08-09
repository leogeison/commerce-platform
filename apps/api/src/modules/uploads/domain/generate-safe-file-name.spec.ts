import { generateSafeFileName } from './generate-safe-file-name';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('generateSafeFileName', () => {
  it('image/jpeg: termina em ".jpg"', () => {
    expect(generateSafeFileName('image/jpeg')).toMatch(/\.jpg$/);
  });

  it('image/png: termina em ".png"', () => {
    expect(generateSafeFileName('image/png')).toMatch(/\.png$/);
  });

  it('image/webp: termina em ".webp"', () => {
    expect(generateSafeFileName('image/webp')).toMatch(/\.webp$/);
  });

  it('parte base do nome (sem a extensão) tem formato de UUID válido', () => {
    const fileName = generateSafeFileName('image/jpeg');
    const base = fileName.replace(/\.jpg$/, '');

    expect(base).toMatch(UUID_PATTERN);
  });

  it('duas chamadas seguidas geram nomes diferentes', () => {
    const first = generateSafeFileName('image/png');
    const second = generateSafeFileName('image/png');

    expect(first).not.toBe(second);
  });
});
