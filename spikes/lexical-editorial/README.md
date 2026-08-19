# Spike Lexical — UXE-001

Ambiente isolado, versionado, para provar o ciclo básico
`Markdown → Lexical → Markdown` via `@lexical/markdown`, antes de qualquer
implementação real do editor.

## Escopo desta tarefa (UXE-001) — e o que **não** é

- Prova só a fixture mínima em `fixture.md` (heading, parágrafo, negrito,
  itálico, lista, link).
- **Não** inclui: transformers/sintaxe de bloco Produto/Oferta, corpus real
  de `Article.bodyMdx`, integração com `apps/admin`, ou qualquer decisão
  sobre o Editorial Serialization Contract. Isso é escopo de `UXE-002`,
  `UXE-003`, `UXE-004` e `UXE-005`, nesta ordem — não antecipado aqui.

## Fato arquitetural relevante — não uma conclusão desta tarefa

O renderer público hoje trata `Article.bodyMdx` como Markdown restrito,
via `@mdx-js/mdx` com `format: 'md'`
(`apps/fastcompre/src/app/[categorySlug]/[articleSlug]/compile-article-body.ts`)
— o parser não reconhece gramática de JSX/expressão/import; não é
sanitização pós-compilação. Isso é registrado aqui como contexto, **não**
como uma exigência de que a sintaxe futura de Produto/Oferta precise ter
uma forma compatível com esse parser especificamente — essa prova ainda
pertence a `UXE-003`/`UXE-004`/`UXE-005`.

A restrição real, válida desde já: qualquer formato futuro persistido em
`Article.bodyMdx` precisa permanecer compatível com o pipeline público
seguro já aprovado, **ou** qualquer alteração desse pipeline volta como
decisão arquitetural/de segurança explícita — nunca como consequência
silenciosa da adoção do editor.

## Dependências

`lexical`, `@lexical/headless`, `@lexical/markdown`, `@lexical/rich-text`,
`@lexical/list`, `@lexical/link` — todas pinadas em `0.49.0` exato (versão
registrada como a que será usada em produção; nenhuma versão estava fixada
em lugar nenhum do repositório antes desta tarefa). Sem `@lexical/code`
— a fixture não tem bloco de código; só entra se um corpus/necessidade
real futura justificar.

Pacote incluído explicitamente no workspace pnpm
(`pnpm-workspace.yaml: "spikes/lexical-editorial"`), sem lockfile próprio
— compartilha o `pnpm-lock.yaml` da raiz.

## Executar

```
pnpm --filter @commerce-platform/spike-lexical-editorial round-trip
```

## Critério de sucesso

O ciclo completo roda sem erro **e** as 5 construções básicas da fixture
são identificadas na serialização de saída (checagens de sintaxe pontuais,
não um parser Markdown novo). Igualdade byte-a-byte com o input
(`byte-identical`) é só observada e reportada — nunca um critério de
PASS/FAIL, nunca fabricada por normalização prévia da fixture.
