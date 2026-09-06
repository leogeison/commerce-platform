/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/grammar.spec.ts
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade.
 *
 * Testes puros (sem Lexical/DOM) de `escapeAltForMarkdown`/
 * `unescapeAltFromMarkdown`/`serializeImageMarkdown`/
 * `parseImageMarkdownLine` — cobre especificamente a preservação literal
 * do alt através do escaping (não a renderização real via `@mdx-js/mdx`,
 * que é uma verificação manual documentada no relatório da tarefa, pelo
 * mesmo motivo já registrado desde a UXE-009: Jest não executa a árvore
 * ESM real de `@mdx-js/mdx` neste projeto sem `transpilePackages`).
 */

import { describe, expect, it } from '@jest/globals';
import {
  escapeAltForMarkdown,
  parseImageMarkdownLine,
  serializeImageMarkdown,
  unescapeAltFromMarkdown,
} from './grammar';

describe('escapeAltForMarkdown / unescapeAltFromMarkdown', () => {
  it('é a inversa exata uma da outra para pontuação Markdown relevante (ênfase, link, colchete)', () => {
    const alt = 'Oferta *especial* [2026]';
    const escaped = escapeAltForMarkdown(alt);
    expect(escaped).toBe('Oferta \\*especial\\* \\[2026\\]');
    expect(unescapeAltFromMarkdown(escaped)).toBe(alt);
  });

  it('escapa e reverte barra invertida literal (":" também é pontuação ASCII escapável pelo CommonMark, junto com "\\")', () => {
    const alt = 'C:\\imagens\\foto';
    const escaped = escapeAltForMarkdown(alt);
    expect(escaped).toBe('C\\:\\\\imagens\\\\foto');
    expect(unescapeAltFromMarkdown(escaped)).toBe(alt);
  });

  it('escapa e reverte "]" isolado', () => {
    const alt = 'Gráfico [nota]';
    const escaped = escapeAltForMarkdown(alt);
    expect(escaped).toBe('Gráfico \\[nota\\]');
    expect(unescapeAltFromMarkdown(escaped)).toBe(alt);
  });

  it('escapa e reverte underscore e backtick (outra pontuação Markdown com significado inline)', () => {
    const alt = 'produto_v2 `npm install`';
    const escaped = escapeAltForMarkdown(alt);
    expect(escaped).toBe('produto\\_v2 \\`npm install\\`');
    expect(unescapeAltFromMarkdown(escaped)).toBe(alt);
  });

  it('alt vazio (decorativa) permanece vazio', () => {
    expect(escapeAltForMarkdown('')).toBe('');
    expect(unescapeAltFromMarkdown('')).toBe('');
  });

  it('texto sem nenhuma pontuação escapável permanece inalterado', () => {
    const alt = 'Foto do produto em uso';
    expect(escapeAltForMarkdown(alt)).toBe(alt);
    expect(unescapeAltFromMarkdown(alt)).toBe(alt);
  });
});

describe('serializeImageMarkdown / parseImageMarkdownLine', () => {
  it('serializa e importa de volta a forma informativa', () => {
    const line = serializeImageMarkdown('Oferta *especial* [2026]', 'https://cdn.exemplo.com/a.jpg');
    expect(line).toBe('![Oferta \\*especial\\* \\[2026\\]](<https://cdn.exemplo.com/a.jpg>)');
    expect(parseImageMarkdownLine(line)).toEqual({
      alt: 'Oferta *especial* [2026]',
      url: 'https://cdn.exemplo.com/a.jpg',
    });
  });

  it('serializa e importa de volta a forma decorativa (alt vazio)', () => {
    const line = serializeImageMarkdown('', 'https://cdn.exemplo.com/b.png');
    expect(line).toBe('![](<https://cdn.exemplo.com/b.png>)');
    expect(parseImageMarkdownLine(line)).toEqual({ alt: '', url: 'https://cdn.exemplo.com/b.png' });
  });

  it('round-trip com barra invertida no alt', () => {
    const line = serializeImageMarkdown('C:\\imagens\\foto', 'https://cdn.exemplo.com/c.webp');
    expect(parseImageMarkdownLine(line)).toEqual({ alt: 'C:\\imagens\\foto', url: 'https://cdn.exemplo.com/c.webp' });
  });

  it('round-trip com underscore/backtick no alt', () => {
    const line = serializeImageMarkdown('produto_v2 `npm install`', 'https://cdn.exemplo.com/d.jpg');
    expect(parseImageMarkdownLine(line)).toEqual({
      alt: 'produto_v2 `npm install`',
      url: 'https://cdn.exemplo.com/d.jpg',
    });
  });

  it('URL contendo parênteses sobrevive ao round-trip (delimitador <...> não depende de a URL nunca ter "(" ou ")")', () => {
    const url = 'https://cdn.exemplo.com/(destaque)/foto(1).jpg';
    const line = serializeImageMarkdown('Alt qualquer', url);
    expect(line).toBe('![Alt qualquer](<https://cdn.exemplo.com/(destaque)/foto(1).jpg>)');
    expect(parseImageMarkdownLine(line)).toEqual({ alt: 'Alt qualquer', url });
  });

  it('linha que não casa a gramática retorna null (não lança)', () => {
    expect(parseImageMarkdownLine('texto comum, não é uma imagem')).toBeNull();
    expect(parseImageMarkdownLine('![alt](sem-angle-brackets.jpg)')).toBeNull();
  });
});
