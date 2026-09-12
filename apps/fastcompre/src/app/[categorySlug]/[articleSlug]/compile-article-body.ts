import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { remarkProductBlock } from './product-block-remark-plugin';

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
 * Escopo estreito desta tarefa (UXE-017): esta função só faz o `productId`
 * atravessar até um `mdxJsxFlowElement` referenciando `ProductBlock` — não
 * passa nenhum componente `ProductBlock` real em `components` (isso
 * pertence a quem chama `MDXContent`, hoje só `page.tsx`, intocado por
 * esta tarefa) e não resolve nenhum dado de Produto/Oferta. Ver
 * `product-block-remark-plugin.ts` para o racional completo.
 */
export async function compileArticleBody(bodyMdx: string) {
  const { default: MDXContent } = await evaluate(bodyMdx, {
    ...runtime,
    format: 'md',
    remarkPlugins: [remarkProductBlock],
  });

  return MDXContent;
}
