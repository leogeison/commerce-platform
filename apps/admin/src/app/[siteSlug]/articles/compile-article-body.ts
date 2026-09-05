/**
 * apps/admin/src/app/[siteSlug]/articles/compile-article-body.ts
 *
 * UXE-009 — Preview do Artigo.
 *
 * Cópia local, deliberada, da técnica de compilação já em produção em
 * `apps/fastcompre/src/app/[categorySlug]/[articleSlug]/compile-article-body.ts`:
 * `evaluate(bodyMdx, { ...runtime, format: 'md' })`. `format: 'md'` faz o
 * compilador nem reconhecer a gramática de JSX/componentes, `{expressão}`
 * ou `import`/`export` como sintaxe válida — mesmo comportamento de
 * segurança normativo do Editorial Serialization Contract (§1, invariantes
 * herdados: "nenhuma extensão futura pode reabrir esse comportamento de
 * segurança para conteúdo comum"). Nenhuma opção nova foi adicionada em
 * relação ao wrapper da FastCompre.
 *
 * Por que duplicado em vez de compartilhado: não existe hoje nenhuma
 * fronteira compartilhada (`packages/*`) com o propósito de hospedar lógica
 * de renderização — `packages/contracts` é escopo de tipos/schemas da API,
 * `packages/ui` não conhece conceitos de domínio como Artigo. Criar um
 * pacote novo só para este wrapper seria decisão arquitetural fora do
 * escopo da UXE-009 (Contract, invariantes herdados: "qualquer package
 * novo é decisão arquitetural explícita, não consequência automática de
 * uma tarefa de UI/editor"). A duplicação aqui é de baixo risco de
 * divergência: a função não tem nenhuma regra de negócio, só repassa dois
 * argumentos fixos — verificado em `compile-article-body.spec.ts` com o
 * mesmo padrão de teste usado no wrapper da FastCompre.
 *
 * `@mdx-js/mdx` é importado dinamicamente (não no topo do módulo) porque o
 * preview é sob demanda (UXE-009, decisão fechada no desenho): carregar a
 * biblioteca só quando o usuário efetivamente abre/atualiza o preview evita
 * incluí-la no carregamento inicial do editor de Artigo, que roda para
 * todo mundo que abre o formulário, preview ou não.
 */

import * as runtime from 'react/jsx-runtime';

export async function compileArticleBody(bodyMdx: string) {
  const { evaluate } = await import('@mdx-js/mdx');

  const { default: MDXContent } = await evaluate(bodyMdx, {
    ...runtime,
    format: 'md',
  });

  return MDXContent;
}

export type CompiledArticleBody = Awaited<ReturnType<typeof compileArticleBody>>;
