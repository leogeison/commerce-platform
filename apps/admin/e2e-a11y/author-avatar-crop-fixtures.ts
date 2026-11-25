import path from 'node:path';
import type { Page, Request, Route } from '@playwright/test';
import { MOCK_API_ORIGIN } from '../e2e-visual/mock-api-origin';
import { SITE_ID, SITE_SLUG, mockMe, paginatedEnvelope } from './fixtures';

/**
 * UXP-003 — fixtures compartilhadas dos specs de browser real do cropper de
 * avatar (axe em `author-avatar-crop.a11y.spec.ts`; asserts programáticos
 * em `author-avatar-crop-behavior.spec.ts`; baseline visual em
 * `../e2e-visual/author-avatar-crop.visual.spec.ts`).
 *
 * Imagens determinísticas geradas para o teste (nenhuma foto real):
 * - `paisagem-1200x800.jpg`: 1200×800 sem EXIF, quadrantes coloridos e um
 *   círculo central;
 * - `exif-orientation-6.jpg`: gravada em 400×600 com `Orientation=6`. A
 *   imagem VISUAL correta é 600×400 com quadrantes vermelho (sup. esq.),
 *   verde (sup. dir.), azul (inf. esq.) e amarelo (inf. dir.) — se a
 *   orientação não for respeitada, as cores saem em posições trocadas.
 */
export const AVATAR_FIXTURES_DIR = path.resolve(__dirname, 'avatar-fixtures');
export const LANDSCAPE_IMAGE = path.join(AVATAR_FIXTURES_DIR, 'paisagem-1200x800.jpg');
export const EXIF_ORIENTATION_6_IMAGE = path.join(AVATAR_FIXTURES_DIR, 'exif-orientation-6.jpg');

export const AUTHOR_ID = '30000000-0000-4000-8000-000000000001';
export const UPLOADED_AVATAR_URL = 'https://media.example.test/avatar-recortado.webp';

export interface CapturedUpload {
  purpose: string | null;
  fileName: string | null;
  contentType: string | null;
  bytes: Buffer;
}

export interface AuthorCreateCapture {
  uploads: CapturedUpload[];
  createdBodies: unknown[];
}

/**
 * Lê um `multipart/form-data` cru (corpo do upload interceptado) — o
 * suficiente para os dois campos que o `AuthorForm` envia (`file`,
 * `purpose`).
 */
export function parseMultipart(request: Request): CapturedUpload {
  const contentType = request.headers()['content-type'] ?? '';
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
  const body = request.postDataBuffer();
  if (!boundary || !body) {
    throw new Error('Upload sem corpo multipart.');
  }
  const delimiter = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let start = body.indexOf(delimiter) + delimiter.length;
  while (start > delimiter.length - 1) {
    const next = body.indexOf(delimiter, start);
    if (next === -1) {
      break;
    }
    parts.push(body.subarray(start + 2, next - 2)); // remove \r\n inicial e final
    start = next + delimiter.length;
  }

  const result: CapturedUpload = { purpose: null, fileName: null, contentType: null, bytes: Buffer.alloc(0) };
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    const headers = part.subarray(0, headerEnd).toString('utf8');
    const content = part.subarray(headerEnd + 4);
    const name = /name="([^"]+)"/.exec(headers)?.[1];
    if (name === 'purpose') {
      result.purpose = content.toString('utf8');
    } else if (name === 'file') {
      result.fileName = /filename="([^"]+)"/.exec(headers)?.[1] ?? null;
      result.contentType = /Content-Type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() ?? null;
      result.bytes = Buffer.from(content);
    }
  }
  return result;
}

/**
 * `/fastcompre/authors/new` → upload → POST do Autor → detalhe. Rotas
 * específicas registradas DEPOIS do fallback genérico (o Playwright avalia
 * as rotas na ordem inversa de registro).
 */
export async function mockAuthorCreateFlow(page: Page): Promise<AuthorCreateCapture> {
  const capture: AuthorCreateCapture = { uploads: [], createdBodies: [] };
  let createdAuthor: {
    id: string;
    siteId: string;
    userId: string | null;
    name: string;
    bio: string | null;
    avatarUrl: string | null;
  } = {
    id: AUTHOR_ID,
    siteId: SITE_ID,
    userId: null,
    name: 'Autor de teste',
    bio: null,
    avatarUrl: null,
  };

  await mockMe(page);
  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginatedEnvelope([])) });
  });
  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/uploads/images`, async (route: Route) => {
    capture.uploads.push(parseMultipart(route.request()));
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ url: UPLOADED_AVATAR_URL }) });
  });
  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/authors`, async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginatedEnvelope([])) });
      return;
    }
    const body = route.request().postDataJSON() as { name: string; bio: string | null; avatarUrl: string | null };
    capture.createdBodies.push(body);
    createdAuthor = { ...createdAuthor, ...body };
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(createdAuthor) });
  });
  await page.route(`${MOCK_API_ORIGIN}/admin/sites/${SITE_SLUG}/authors/${AUTHOR_ID}`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(createdAuthor) });
  });
  // O avatar "enviado" aponta para um domínio fictício: responde com um
  // pixel válido para não gerar erro de imagem no detalhe.
  await page.route('https://media.example.test/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
  });

  return capture;
}

export interface DecodedImage {
  width: number;
  height: number;
  /** Cores RGB nos pontos pedidos (coordenadas em pixels da imagem decodificada). */
  samples: Array<[number, number, number]>;
}

/** Decodifica bytes de imagem no próprio Chromium (WebP/PNG) e amostra pixels. */
export async function decodeInBrowser(
  page: Page,
  bytes: Buffer,
  type: string,
  points: Array<[number, number]>,
): Promise<DecodedImage> {
  return page.evaluate(
    async ({ base64, mimeType, samplePoints }) => {
      const binary = atob(base64);
      const data = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        data[i] = binary.charCodeAt(i);
      }
      const bitmap = await createImageBitmap(new Blob([data], { type: mimeType }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      const samples = samplePoints.map(([x, y]) => {
        const [r, g, b] = context.getImageData(x, y, 1, 1).data;
        return [r, g, b] as [number, number, number];
      });
      return { width: bitmap.width, height: bitmap.height, samples };
    },
    { base64: bytes.toString('base64'), mimeType: type, samplePoints: points },
  );
}

/** Abre `/authors/new`, preenche o nome e seleciona `imagePath` no campo Avatar. */
export async function openCropperOnNewAuthor(page: Page, imagePath: string) {
  await page.goto(`/${SITE_SLUG}/authors/new`);
  await page.getByLabel('Nome').fill('Autor de teste');
  await page.getByLabel('Avatar').setInputFiles(imagePath);
  const dialog = page.getByRole('dialog', { name: 'Recortar avatar' });
  // Pronto = área de recorte renderizada (depende da imagem carregar).
  await dialog.getByRole('group', { name: /Área de recorte/ }).waitFor();
  return dialog;
}
