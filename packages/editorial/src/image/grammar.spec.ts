/**
 * packages/editorial/src/image/grammar.spec.ts
 *
 * UXE-010 (gramática base) / UXE-022 (extensão de dimensões `{width=N}` /
 * `{width=N height=M}`, Contract §10) — suíte normativa desta gramática,
 * a especificação mais baixa possível (sem Lexical, sem MDX/remark, ver
 * mesmo racional já registrado em `../product-block/grammar.spec.ts`). A
 * suíte de integração de cada consumidor
 * (`apps/admin/.../article-body-image/image-block.spec.ts` para o
 * transformer Lexical, `apps/admin/.../image-dimensions-remark-plugin.spec.ts`
 * e `apps/fastcompre/.../image-dimensions-remark-plugin.spec.ts` para os
 * adapters remark) reusa `IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS` exportado
 * deste módulo — nunca duplica os casos aqui à mão — para comprovar a
 * equivalência obrigatória entre os quatro consumidores.
 */

import { describe, expect, it } from '@jest/globals';
import {
  IMAGE_BASE_REGEXP,
  IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS,
  IMAGE_WIDTH_EXTENSION_REGEXP,
  IMAGE_WIDTH_HEIGHT_EXTENSION_REGEXP,
  MAX_IMAGE_HEIGHT,
  MAX_IMAGE_WIDTH,
  MIN_IMAGE_HEIGHT,
  MIN_IMAGE_WIDTH,
  clampImageHeight,
  clampImageWidth,
  escapeAltForMarkdown,
  isValidImageHeight,
  isValidImageWidth,
  parseImageBase,
  parseImageDimensionsExtension,
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

  it('alt vazio (decorativa) permanece vazio', () => {
    expect(escapeAltForMarkdown('')).toBe('');
    expect(unescapeAltFromMarkdown('')).toBe('');
  });
});

describe('parseImageBase / IMAGE_BASE_REGEXP — gramática de base (informativa/decorativa), sem âncora de fim de linha', () => {
  it('casa só o PREFIXO da imagem, deixando o restante da linha de fora do match — evidência mdast do Contract §10', () => {
    const line = '![alt](<https://cdn.exemplo.com/a.jpg>){width=600 height=300}';
    const parsed = parseImageBase(line);
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual({ alt: 'alt', url: 'https://cdn.exemplo.com/a.jpg', matchedLength: '![alt](<https://cdn.exemplo.com/a.jpg>)'.length });
    expect(line.slice(parsed!.matchedLength)).toBe('{width=600 height=300}');
  });

  it('sem sufixo nenhum: matchedLength cobre a linha inteira', () => {
    const line = '![](<https://cdn.exemplo.com/b.png>)';
    const parsed = parseImageBase(line);
    expect(parsed).toEqual({ alt: '', url: 'https://cdn.exemplo.com/b.png', matchedLength: line.length });
  });

  it('linha que não casa a gramática de base retorna null (não lança)', () => {
    expect(parseImageBase('texto comum, não é uma imagem')).toBeNull();
    expect(parseImageBase('![alt](sem-angle-brackets.jpg)')).toBeNull();
  });

  it('controle: IMAGE_BASE_REGEXP não é âncorado no fim (diferente do antigo IMAGE_LINE_REGEXP da UXE-010)', () => {
    expect(IMAGE_BASE_REGEXP.source.endsWith('$')).toBe(false);
  });
});

describe('isValidImageWidth / MIN_IMAGE_WIDTH / MAX_IMAGE_WIDTH', () => {
  it('aceita exatamente a faixa fechada [100, 1200]', () => {
    expect(isValidImageWidth(MIN_IMAGE_WIDTH)).toBe(true);
    expect(isValidImageWidth(MAX_IMAGE_WIDTH)).toBe(true);
    expect(isValidImageWidth(600)).toBe(true);
  });

  it('rejeita abaixo do mínimo, acima do máximo, zero, negativo e não inteiro — nunca clampa', () => {
    expect(isValidImageWidth(MIN_IMAGE_WIDTH - 1)).toBe(false);
    expect(isValidImageWidth(MAX_IMAGE_WIDTH + 1)).toBe(false);
    expect(isValidImageWidth(0)).toBe(false);
    expect(isValidImageWidth(-100)).toBe(false);
    expect(isValidImageWidth(100.5)).toBe(false);
  });
});

describe('isValidImageHeight / MIN_IMAGE_HEIGHT / MAX_IMAGE_HEIGHT — mesma faixa de width, função própria (decisão fechada do PO)', () => {
  it('aceita exatamente a faixa fechada [100, 1200]', () => {
    expect(isValidImageHeight(MIN_IMAGE_HEIGHT)).toBe(true);
    expect(isValidImageHeight(MAX_IMAGE_HEIGHT)).toBe(true);
    expect(isValidImageHeight(300)).toBe(true);
  });

  it('rejeita abaixo do mínimo, acima do máximo, zero, negativo e não inteiro — nunca clampa', () => {
    expect(isValidImageHeight(MIN_IMAGE_HEIGHT - 1)).toBe(false);
    expect(isValidImageHeight(MAX_IMAGE_HEIGHT + 1)).toBe(false);
    expect(isValidImageHeight(0)).toBe(false);
    expect(isValidImageHeight(-100)).toBe(false);
    expect(isValidImageHeight(300.5)).toBe(false);
  });
});

describe('parseImageDimensionsExtension / IMAGE_WIDTH_EXTENSION_REGEXP / IMAGE_WIDTH_HEIGHT_EXTENSION_REGEXP — casa o TRECHO INTEIRO, nunca um prefixo', () => {
  it('forma só-largura válida: retorna { width }, sem height', () => {
    expect(parseImageDimensionsExtension('{width=600}')).toEqual({ width: 600 });
    expect(parseImageDimensionsExtension('{width=100}')).toEqual({ width: 100 });
    expect(parseImageDimensionsExtension('{width=1200}')).toEqual({ width: 1200 });
  });

  it('forma só-largura sintaticamente numérica mas fora da faixa: retorna null, NUNCA converte/clampa para 100/1200', () => {
    expect(parseImageDimensionsExtension('{width=50}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=1201}')).toBeNull();
  });

  it('forma combinada válida: retorna { width, height }', () => {
    expect(parseImageDimensionsExtension('{width=600 height=300}')).toEqual({ width: 600, height: 300 });
    expect(parseImageDimensionsExtension('{width=100 height=100}')).toEqual({ width: 100, height: 100 });
    expect(parseImageDimensionsExtension('{width=1200 height=1200}')).toEqual({ width: 1200, height: 1200 });
  });

  it('atomicidade: um eixo válido e outro fora da faixa rejeita a extensão INTEIRA — nunca aplica parcialmente', () => {
    expect(parseImageDimensionsExtension('{width=600 height=50}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=600 height=1201}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=50 height=600}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=1201 height=600}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=99999 height=99999}')).toBeNull();
  });

  it('{height=M} isolado NUNCA é reconhecido — decisão fechada do PO, mesmo com a extensão de dimensões existindo', () => {
    expect(parseImageDimensionsExtension('{height=600}')).toBeNull();
  });

  it('ordem invertida (height antes de width) NUNCA é reconhecida, mesmo com os dois valores válidos', () => {
    expect(parseImageDimensionsExtension('{height=300 width=600}')).toBeNull();
  });

  it('zero à esquerda nunca casa em nenhum eixo (mesmo estando sintaticamente "correto" sem o zero)', () => {
    expect(parseImageDimensionsExtension('{width=0600}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=600 height=0300}')).toBeNull();
    expect(IMAGE_WIDTH_EXTENSION_REGEXP.test('{width=0600}')).toBe(false);
    expect(IMAGE_WIDTH_HEIGHT_EXTENSION_REGEXP.test('{width=600 height=0300}')).toBe(false);
  });

  it('zero, negativo, decimal, não numérico, unidade (px/%): todos null, em qualquer eixo', () => {
    expect(parseImageDimensionsExtension('{width=0}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=-100}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=100.5}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=abc}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=600px}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=50%}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=600 height=300.5}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=600 height=abc}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=600 height=300px}')).toBeNull();
  });

  it('espaçamento incorreto na forma combinada (ausente ou duplo) rejeita — forma exata, nunca tolerante', () => {
    expect(parseImageDimensionsExtension('{width=600height=300}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=600  height=300}')).toBeNull();
  });

  it('lixo à direita (trecho maior que a extensão exata) rejeita a extensão inteira — nunca consumo parcial', () => {
    expect(parseImageDimensionsExtension('{width=600} ')).toBeNull();
    expect(parseImageDimensionsExtension('{width=600} legenda')).toBeNull();
    expect(parseImageDimensionsExtension(' {width=600}')).toBeNull();
    expect(parseImageDimensionsExtension('{width=600 height=300} ')).toBeNull();
  });

  it('ausência (string vazia): null, nunca lança', () => {
    expect(parseImageDimensionsExtension('')).toBeNull();
  });

  it('nunca lança para nenhuma entrada — comportamento "casa ou não casa", nunca fail-closed por exceção (diferente de :::product/Ponto 2)', () => {
    expect(() => parseImageDimensionsExtension('qualquer coisa')).not.toThrow();
  });
});

describe('clampImageWidth — helper de UI, nunca usado para (re)interpretar persistência', () => {
  it('sem naturalWidth conhecido: restringe a [100, 1200]', () => {
    expect(clampImageWidth(50)).toBe(100);
    expect(clampImageWidth(5000)).toBe(1200);
    expect(clampImageWidth(600)).toBe(600);
  });

  it('com naturalWidth conhecido: nunca faz upscale além dele, mesmo com naturalWidth < 1200', () => {
    expect(clampImageWidth(900, 500)).toBe(500);
    expect(clampImageWidth(50, 500)).toBe(100);
  });

  it('naturalWidth abaixo do mínimo normativo: nunca produz upperBound < MIN_IMAGE_WIDTH (defensivo — handle não é oferecido nesse caso pela UI, mas o helper permanece correto isoladamente)', () => {
    expect(clampImageWidth(50, 40)).toBe(100);
  });

  it('arredonda para inteiro', () => {
    expect(clampImageWidth(600.6)).toBe(601);
  });
});

describe('clampImageHeight — mesma forma de clampImageWidth, para o eixo height', () => {
  it('sem naturalHeight conhecido: restringe a [100, 1200]', () => {
    expect(clampImageHeight(50)).toBe(100);
    expect(clampImageHeight(5000)).toBe(1200);
    expect(clampImageHeight(300)).toBe(300);
  });

  it('com naturalHeight conhecido: nunca faz upscale além dele, mesmo com naturalHeight < 1200', () => {
    expect(clampImageHeight(900, 400)).toBe(400);
    expect(clampImageHeight(50, 400)).toBe(100);
  });

  it('naturalHeight abaixo do mínimo normativo: nunca produz upperBound < MIN_IMAGE_HEIGHT', () => {
    expect(clampImageHeight(50, 40)).toBe(100);
  });

  it('arredonda para inteiro', () => {
    expect(clampImageHeight(300.6)).toBe(301);
  });
});

describe('serializeImageMarkdown — width/height opcionais, forma canônica', () => {
  it('sem width: forma idêntica à UXE-010, nenhuma imagem legada precisa de migração', () => {
    expect(serializeImageMarkdown('Alt', 'https://cdn.exemplo.com/a.jpg')).toBe('![Alt](<https://cdn.exemplo.com/a.jpg>)');
  });

  it('com width, sem height: anexa {width=N} imediatamente após, sem espaço — forma legada preservada', () => {
    expect(serializeImageMarkdown('Alt', 'https://cdn.exemplo.com/a.jpg', 600)).toBe(
      '![Alt](<https://cdn.exemplo.com/a.jpg>){width=600}',
    );
  });

  it('com width e height: anexa {width=N height=M}, ordem fixa, um espaço', () => {
    expect(serializeImageMarkdown('Alt', 'https://cdn.exemplo.com/a.jpg', 600, 300)).toBe(
      '![Alt](<https://cdn.exemplo.com/a.jpg>){width=600 height=300}',
    );
  });

  it('round-trip só-largura: serializar com width e reimportar via parseImageBase + parseImageDimensionsExtension devolve os mesmos valores', () => {
    const alt = 'Produto em destaque';
    const url = 'https://cdn.exemplo.com/b.png';
    const width = 350;
    const line = serializeImageMarkdown(alt, url, width);

    const base = parseImageBase(line);
    expect(base).not.toBeNull();
    expect(base).toMatchObject({ alt, url });

    const rest = line.slice(base!.matchedLength);
    expect(parseImageDimensionsExtension(rest)).toEqual({ width });
  });

  it('round-trip largura+altura: serializar com os dois e reimportar devolve os mesmos valores', () => {
    const alt = 'Banner de campanha';
    const url = 'https://cdn.exemplo.com/c.png';
    const width = 800;
    const height = 450;
    const line = serializeImageMarkdown(alt, url, width, height);

    const base = parseImageBase(line);
    expect(base).not.toBeNull();
    expect(base).toMatchObject({ alt, url });

    const rest = line.slice(base!.matchedLength);
    expect(parseImageDimensionsExtension(rest)).toEqual({ width, height });
  });
});

describe('IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS — corpus normativo compartilhado (Contract §10, equivalência obrigatória)', () => {
  it('cada caso do corpus é reproduzido exatamente por parseImageDimensionsExtension (linha de base deste módulo)', () => {
    for (const testCase of IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS) {
      const result = parseImageDimensionsExtension(testCase.suffix);
      if (testCase.expectedWidth === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toEqual({
          width: testCase.expectedWidth,
          ...(testCase.expectedHeight === null ? {} : { height: testCase.expectedHeight }),
        });
      }
    }
  });

  it('corpus não está vazio e cobre pelo menos um caso de aceitação só-largura, um de aceitação combinada e um de rejeição', () => {
    expect(IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS.length).toBeGreaterThan(0);
    expect(IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS.some((c) => c.expectedWidth !== null && c.expectedHeight === null)).toBe(true);
    expect(IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS.some((c) => c.expectedWidth !== null && c.expectedHeight !== null)).toBe(true);
    expect(IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS.some((c) => c.expectedWidth === null)).toBe(true);
  });

  it('nenhum caso do corpus produz height sem width (invariante estrutural da gramática)', () => {
    for (const testCase of IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS) {
      if (testCase.expectedHeight !== null) {
        expect(testCase.expectedWidth).not.toBeNull();
      }
    }
  });
});
