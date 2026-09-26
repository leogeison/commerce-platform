import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { remarkProductBlock } from './product-block-remark-plugin';
import { remarkImageDimensions } from './image-dimensions-remark-plugin';

/**
 * A renderização pública trata `bodyMdx` como Markdown restrito, não como
 * MDX completo. `format: 'md'` faz o compilador nem reconhecer a gramática
 * de JSX/componentes, `{expressão}` ou `import`/`export` como sintaxe
 * válida: não é uma sanitização aplicada sobre o resultado, é o parser
 * (`micromark`, sem a extensão `micromark-extension-mdxjs`) simplesmente
 * não tendo essas regras. `remarkPlugins: [remarkProductBlock]` (UXE-017)
 * não reabre esse comportamento — só adiciona reconhecimento estrutural
 * do bloco `:::product` já normativo (Editorial Serialization Contract
 * §3/§7), por cima do mesmo `format: 'md'` inalterado; conteúdo Markdown
 * comum sem esse padrão continua compilando exatamente como antes.
 *
 * Escopo original da UXE-017: esta função só fazia o `productId` atravessar
 * até um `mdxJsxFlowElement` referenciando `ProductBlock` — não passava
 * nenhum componente `ProductBlock` real em `components` (isso pertence a
 * quem chama `MDXContent`) e não resolvia nenhum dado de Produto/Oferta.
 * Ver `product-block-remark-plugin.ts` para o racional completo da
 * gramática/reconhecimento, que continua inalterado.
 *
 * UXW-011 — `referencedProductIds`: além de `MDXContent`, o retorno agora
 * inclui o `Set<string>` de `productId`s que `remarkProductBlock`
 * reconheceu e transformou de verdade nesta compilação (populado por
 * referência, ver o racional completo no coletor em
 * `product-block-remark-plugin.ts`). Não é um segundo parse de `bodyMdx` —
 * é o mesmo reconhecimento que já gerou os `mdxJsxFlowElement`, só também
 * relatado ao chamador. Único consumidor real hoje é `page.tsx`, para
 * excluir da seção estática de Produtos os já exibidos inline (Editorial
 * Serialization Contract §6, ADENDO UXE-018) — por isso `Set`, não
 * callback: não há múltiplos eventos a tratar, só "quais IDs apareceram".
 * Se `evaluate()` rejeitar (bloco malformado, `ProductBlockSyntaxError`),
 * esta função também rejeita e não devolve nada — o estado do `Set` até
 * aquele ponto é inobservável para quem chama, e por isso não é uma
 * garantia deste contrato.
 */
export async function compileArticleBody(bodyMdx: string) {
  const referencedProductIds = new Set<string>();

  const { default: MDXContent } = await evaluate(bodyMdx, {
    ...runtime,
    format: 'md',
    remarkPlugins: [() => remarkProductBlock(referencedProductIds), remarkImageDimensions],
  });

  return { MDXContent, referencedProductIds };
}
