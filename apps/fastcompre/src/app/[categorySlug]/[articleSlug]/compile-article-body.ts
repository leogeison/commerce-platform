import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';

/**
 * A renderização pública trata `bodyMdx` como Markdown restrito, não como
 * MDX completo. `format: 'md'` faz o compilador nem reconhecer a gramática
 * de JSX/componentes, `{expressão}` ou `import`/`export` como sintaxe
 * válida: não é uma sanitização aplicada sobre o resultado, é o parser
 * (`micromark`, sem a extensão `micromark-extension-mdxjs`) simplesmente
 * não tendo essas regras.
 */
export async function compileArticleBody(bodyMdx: string) {
  const { default: MDXContent } = await evaluate(bodyMdx, {
    ...runtime,
    format: 'md',
  });

  return MDXContent;
}
