/**
 * apps/fastcompre/src/app/[categorySlug]/[articleSlug]/product-block.spec.tsx
 *
 * UXE-018 — Matriz de testes do componente público `ProductBlock`
 * (`createProductBlockComponent`) e da sua integração real com o plugin
 * MDX do FastCompre (`remarkProductBlock`, UXE-017).
 *
 * Estrutura:
 * 1. Unidade do componente (`renderToStaticMarkup`) — cada estado definido
 *    no desenho aprovado: found com Ofertas mistas, found com todas as
 *    Ofertas indisponíveis, found com `offers: []`, not-found.
 * 2. CTA/tracking exato — `href` byte-a-byte igual a
 *    `GET /r/:siteSlug/:offerId?articleId=...`, nunca `affiliateUrl`.
 * 3. Acessibilidade (`jest-axe`) para os estados definidos no desenho.
 * 4. Integração real do plugin → componente ("wiring") — usa o
 *    `remarkProductBlock()` de produção de verdade (mesma disciplina de
 *    `jest.doMock('unist-util-visit', ...)` com reimplementação funcional
 *    já estabelecida em `product-block-remark-plugin.spec.ts`) para
 *    transformar um `bodyMdx` real num `mdxJsxFlowElement` real
 *    (`{name: 'ProductBlock', attributes: [{name: 'productId', ...}]}`),
 *    e então invoca `createProductBlockComponent` de produção exatamente
 *    da forma como o runtime JSX de `@mdx-js/mdx` invocaria esse elemento
 *    (`React.createElement(components[element.name], props construídas a
 *    partir de attributes)`) — provando a integração real entre o plugin
 *    de produção e o componente de produção.
 *
 *    IMPORTANTE — limitação de ambiente conhecida (já documentada em
 *    `compile-article-body.spec.ts`/`product-block-remark-plugin.spec.ts`
 *    desde a UXE-017): `next/jest` não transforma pacotes ESM puros de
 *    `node_modules`, e `@mdx-js/mdx` é um desses pacotes — por isso
 *    `evaluate()` real não pode rodar dentro do Jest. Esta suíte NÃO tenta
 *    chamar `compileArticleBody`/`evaluate()` real; ela substitui apenas a
 *    "cola" do runtime MDX (a associação `nome do elemento → componente
 *    de `components` → `createElement`), que é boilerplate genérico do
 *    `@mdx-js/mdx`, não lógica de produção deste projeto. A fidelidade
 *    real e completa do pipeline, incluindo `evaluate()` de verdade, é
 *    coberta pela prova standalone fora do Jest,
 *    `spikes/lexical-editorial/uxe-018-public-resolution-proof.mjs` (ver
 *    esse arquivo para o racional completo) — é lá, não aqui, que a prova
 *    V1/V2 com o `MDXContent` real compilado uma única vez é feita.
 * 5. Prova V1/V2 (nível de wiring, dentro do Jest) — o mesmo
 *    `mdxJsxFlowElement` resultante de uma única chamada a
 *    `remarkProductBlock()` é renderizado duas vezes com fixtures de
 *    Produto diferentes para o mesmo `productId`/`offerId`, mostrando que
 *    preço/disponibilidade exibidos vêm do array de Produtos passado no
 *    momento da renderização, não de algo derivado do `bodyMdx`/AST em si
 *    (que nunca muda entre as duas renderizações). A prova equivalente com
 *    o `MDXContent` real, compilado por `@mdx-js/mdx` de verdade, está no
 *    script standalone citado acima — esta aqui não substitui aquela.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, type ComponentType } from 'react';
import { axe } from 'jest-axe';
import type { PublicArticleProduct } from '@commerce-platform/contracts';
import { createProductBlockComponent, type ProductBlockProps } from './product-block';

const ARTICLE_ID = '99999999-9999-4999-8999-999999999999';

function buildProduct(overrides: Partial<PublicArticleProduct> = {}): PublicArticleProduct {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Fone Bluetooth XYZ',
    description: 'Cancelamento de ruído ativo.',
    imageUrl: 'https://cdn.example.com/fone-xyz.jpg',
    position: 0,
    offers: [],
    ...overrides,
  };
}

describe('ProductBlock (unidade)', () => {
  describe('found — Ofertas mistas (1 inStock:true + 1 inStock:false)', () => {
    const product = buildProduct({
      offers: [
        { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', marketplace: 'AMAZON_BR', price: '199.90', currency: 'BRL', inStock: true },
        { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', marketplace: 'MERCADO_LIVRE', price: '209.90', currency: 'BRL', inStock: false },
      ],
    });
    const ProductBlock = createProductBlockComponent([product], ARTICLE_ID);
    const html = renderToStaticMarkup(<ProductBlock productId={product.id} />);

    it('renderiza nome, descrição e imagem do Product', () => {
      expect(html).toContain('Fone Bluetooth XYZ');
      expect(html).toContain('Cancelamento de ruído ativo.');
      expect(html).toContain('src="https://cdn.example.com/fone-xyz.jpg"');
      expect(html).toContain('alt="Fone Bluetooth XYZ"');
    });

    it('não mostra o aviso de indisponibilidade (existe Oferta em estoque)', () => {
      expect(html).not.toContain('Temporariamente indisponível');
    });

    it('Oferta inStock:true vira link real; inStock:false permanece texto', () => {
      expect(html).toContain(`href="http://localhost:3000/r/test-site/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?articleId=${ARTICLE_ID}"`);
      expect(html).toContain('AMAZON_BR — 199.90 BRL');
      expect(html).toContain('MERCADO_LIVRE — 209.90 BRL (indisponível)');
      // A Oferta indisponível nunca deve estar dentro de um <a>.
      expect(html).not.toMatch(/<a[^>]*>[^<]*MERCADO_LIVRE/);
    });

    it('CTA tem rel de afiliado correto e indicação acessível de nova aba', () => {
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="sponsored nofollow noopener noreferrer"');
      expect(html).toContain('abre em nova aba');
    });

    it('nunca expõe affiliateUrl (campo inexistente no contrato)', () => {
      expect(html).not.toContain('affiliateUrl');
    });
  });

  describe('found — todas as Ofertas inStock:false', () => {
    const product = buildProduct({
      offers: [
        { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', marketplace: 'AMAZON_BR', price: '199.90', currency: 'BRL', inStock: false },
        { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', marketplace: 'MERCADO_LIVRE', price: '209.90', currency: 'BRL', inStock: false },
      ],
    });
    const ProductBlock = createProductBlockComponent([product], ARTICLE_ID);
    const html = renderToStaticMarkup(<ProductBlock productId={product.id} />);

    it('mostra o aviso de indisponibilidade e nenhum <a> de CTA', () => {
      expect(html).toContain('Temporariamente indisponível');
      expect(html).not.toContain('<a ');
      expect(html).toContain('AMAZON_BR — 199.90 BRL (indisponível)');
      expect(html).toContain('MERCADO_LIVRE — 209.90 BRL (indisponível)');
    });

    it('Product continua renderizado (nome/descrição/imagem)', () => {
      expect(html).toContain('Fone Bluetooth XYZ');
      expect(html).toContain('Cancelamento de ruído ativo.');
    });
  });

  describe('found — offers: []', () => {
    const product = buildProduct({ offers: [] });
    const ProductBlock = createProductBlockComponent([product], ARTICLE_ID);
    const html = renderToStaticMarkup(<ProductBlock productId={product.id} />);

    it('mostra o aviso de indisponibilidade e nenhuma lista de Ofertas', () => {
      expect(html).toContain('Temporariamente indisponível');
      expect(html).not.toContain('<ul');
    });

    it('Product continua renderizado', () => {
      expect(html).toContain('Fone Bluetooth XYZ');
    });
  });

  describe('not-found — referência ausente em article.products[]', () => {
    const otherProduct = buildProduct({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Produto que não deveria vazar',
      offers: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', marketplace: 'AMAZON_BR', price: '1.00', currency: 'BRL', inStock: true }],
    });
    const ProductBlock = createProductBlockComponent([otherProduct], ARTICLE_ID);
    const html = renderToStaticMarkup(<ProductBlock productId="33333333-3333-4333-8333-333333333333" />);

    it('mostra o estado visual mínimo "Produto não disponível."', () => {
      expect(html).toContain('Produto não disponível.');
    });

    it('não vaza nenhum dado de outro Product do array', () => {
      expect(html).not.toContain('Produto que não deveria vazar');
      expect(html).not.toContain('AMAZON');
      expect(html).not.toContain('1.00');
    });

    it('não contém nenhum elemento interativo/focável', () => {
      expect(html).not.toContain('<a ');
      expect(html).not.toContain('<button');
      expect(html).not.toMatch(/tabindex/i);
    });
  });
});

describe('ProductBlock — acessibilidade (jest-axe)', () => {
  it('found com Ofertas mistas: sem violação', async () => {
    const product = buildProduct({
      offers: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', marketplace: 'AMAZON_BR', price: '199.90', currency: 'BRL', inStock: true }],
    });
    const ProductBlock = createProductBlockComponent([product], ARTICLE_ID);
    const { container } = render(<ProductBlock productId={product.id} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('found com offers: []: sem violação', async () => {
    const product = buildProduct({ offers: [] });
    const ProductBlock = createProductBlockComponent([product], ARTICLE_ID);
    const { container } = render(<ProductBlock productId={product.id} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('not-found: sem violação', async () => {
    const ProductBlock = createProductBlockComponent([], ARTICLE_ID);
    const { container } = render(<ProductBlock productId="33333333-3333-4333-8333-333333333333" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

/**
 * Reimplementação funcional mínima de `visit(tree, type, visitor)` —
 * mesma disciplina e mesmo código de duplo de teste já estabelecidos em
 * `product-block-remark-plugin.spec.ts` (ver o comentário completo lá).
 * Necessária aqui porque `compileArticleBody` → `remarkProductBlock`
 * precisa rodar de verdade nestes testes de integração, e `next/jest` não
 * transforma o pacote ESM puro `unist-util-visit` de dentro de
 * `node_modules`.
 */
interface MdastNode {
  type: string;
  children?: unknown[];
}

function visit(tree: unknown, type: string, visitor: (node: unknown, index: number | undefined, parent: unknown) => void) {
  function walk(node: unknown, index: number | undefined, parent: unknown) {
    if (!node || typeof node !== 'object') {
      return;
    }
    if ((node as MdastNode).type === type) {
      visitor(node, index, parent);
    }
    const children = (node as MdastNode).children;
    if (Array.isArray(children)) {
      for (let i = 0; i < children.length; i++) {
        walk(children[i], i, node);
      }
    }
  }
  walk(tree, undefined, undefined);
}

const INTEGRATION_PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const INTEGRATION_OFFER_ID = '55555555-5555-4555-8555-555555555555';

/**
 * Equivalente ao `bodyMdx`:
 *   Confira nossa recomendação:
 *
 *   :::product
 *   version: 1
 *   productId: <INTEGRATION_PRODUCT_ID>
 *   :::
 *
 *   Texto depois do bloco.
 * — já na forma de árvore mdast que `remark-parse` produziria sob
 * `format: 'md'` (ver `transformIntegrationBodyToElement`), para poder
 * chamar `remarkProductBlock()` de produção diretamente.
 */
interface MdastJsxFlowElement {
  type: 'mdxJsxFlowElement';
  name: string;
  attributes: Array<{ type: string; name: string; value: string }>;
}

describe('ProductBlock — integração real do plugin (remarkProductBlock) com o componente (createProductBlockComponent)', () => {
  afterEach(() => {
    jest.resetModules();
  });

  const PRODUCT_BLOCK_PARAGRAPH_TEXT = [':::product', 'version: 1', `productId: ${INTEGRATION_PRODUCT_ID}`, ':::'].join('\n');

  /**
   * Roda o `remarkProductBlock()` de produção de verdade contra uma árvore
   * mdast real (mesma forma que `remark-parse` produziria sob `format:
   * 'md'` — um único parágrafo cujo único filho `text` é o bloco
   * `:::product`, ver o racional em `product-block-remark-plugin.ts`),
   * devolvendo o `mdxJsxFlowElement` real resultante.
   */

  async function transformIntegrationBodyToElement(): Promise<MdastJsxFlowElement> {
    jest.doMock('unist-util-visit', () => ({ visit }));
    const { remarkProductBlock } = await import('./product-block-remark-plugin');
    // Mesma forma que `remark-parse` produziria para `INTEGRATION_BODY_MDX`
    // sob `format: 'md'`: um parágrafo antes, um parágrafo cujo único
    // filho `text` é o bloco `:::product` inteiro, um parágrafo depois.
    const tree = {
      type: 'root' as const,
      children: [
        { type: 'paragraph', children: [{ type: 'text', value: 'Confira nossa recomendação:' }] },
        { type: 'paragraph', children: [{ type: 'text', value: PRODUCT_BLOCK_PARAGRAPH_TEXT }] },
        { type: 'paragraph', children: [{ type: 'text', value: 'Texto depois do bloco.' }] },
      ],
    };
    remarkProductBlock()(tree);
    return tree.children[1] as unknown as MdastJsxFlowElement;
  }

  /**
   * Invoca `components[element.name]` exatamente como o runtime JSX que
   * `@mdx-js/mdx` gera internamente invocaria um `mdxJsxFlowElement`:
   * `createElement(componente, propsMontadasA PartirDosAttributes)`. Esta
   * é a única parte simulada aqui — boilerplate genérico do `@mdx-js/mdx`,
   * não lógica de produção deste projeto (ver nota de limitação de
   * ambiente no cabeçalho do arquivo).
   */
  function renderMdxJsxElement(
    element: MdastJsxFlowElement,
    components: { ProductBlock: ComponentType<ProductBlockProps> },
  ) {
    const Component = components[element.name as 'ProductBlock'];
    const props = Object.fromEntries(element.attributes.map((attr) => [attr.name, attr.value])) as unknown as ProductBlockProps;
    return renderToStaticMarkup(createElement(Component, props));
  }

  it('productId extraído pelo plugin real chega ao ProductBlock real e resolve o Product correto', async () => {
    const element = await transformIntegrationBodyToElement();
    expect(element.type).toBe('mdxJsxFlowElement');
    expect(element.name).toBe('ProductBlock');
    expect(element.attributes).toEqual([{ type: 'mdxJsxAttribute', name: 'productId', value: INTEGRATION_PRODUCT_ID }]);

    const product = buildProduct({
      id: INTEGRATION_PRODUCT_ID,
      name: 'Produto da integração MDX',
      offers: [{ id: INTEGRATION_OFFER_ID, marketplace: 'AMAZON_BR', price: '149.90', currency: 'BRL', inStock: true }],
    });
    const ProductBlock = createProductBlockComponent([product], ARTICLE_ID);

    const html = renderMdxJsxElement(element, { ProductBlock });

    expect(html).toContain('Produto da integração MDX');
    expect(html).toContain('149.90 BRL');
  });

  it('prova V1/V2 (nível de wiring): o mesmo mdxJsxFlowElement (mesma transformação do plugin) reflete preço/disponibilidade diferentes ao renderizar com products V1 e V2 — nenhum dado comercial vem do AST/bodyMdx', async () => {
    const element = await transformIntegrationBodyToElement();

    const productV1 = buildProduct({
      id: INTEGRATION_PRODUCT_ID,
      name: 'Produto da integração MDX',
      offers: [{ id: INTEGRATION_OFFER_ID, marketplace: 'AMAZON_BR', price: '149.90', currency: 'BRL', inStock: true }],
    });
    const productV2 = buildProduct({
      id: INTEGRATION_PRODUCT_ID,
      name: 'Produto da integração MDX',
      offers: [{ id: INTEGRATION_OFFER_ID, marketplace: 'AMAZON_BR', price: '129.90', currency: 'BRL', inStock: false }],
    });

    // Mesmo `element` (resultado de uma única transformação do plugin
    // real) renderizado duas vezes — só o fixture de `products` passado à
    // fábrica muda entre as duas renderizações.
    const htmlV1 = renderMdxJsxElement(element, { ProductBlock: createProductBlockComponent([productV1], ARTICLE_ID) });
    const htmlV2 = renderMdxJsxElement(element, { ProductBlock: createProductBlockComponent([productV2], ARTICLE_ID) });

    expect(htmlV1).toContain('149.90 BRL');
    expect(htmlV1).not.toContain('Temporariamente indisponível');

    expect(htmlV2).toContain('129.90 BRL');
    expect(htmlV2).toContain('Temporariamente indisponível');

    expect(htmlV1).not.toEqual(htmlV2);
  });
});
