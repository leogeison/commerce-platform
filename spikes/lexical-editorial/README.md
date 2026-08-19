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

---

# UXE-002 — Round-trip 1: `bodyMdx` existente → Lexical → `bodyMdx`

Valida empiricamente se conteúdo Markdown comum sobrevive ao ciclo completo
(`Markdown → Lexical → Markdown`) sem perda de fidelidade — usando o mesmo
mecanismo determinístico da UXE-001 (`createHeadlessEditor` +
`editor.update(fn, { discrete: true })`), agora sobre dois corpora
versionados em vez de uma fixture única.

## Escopo desta tarefa — e o que **não** é

- Prova só Markdown comum (títulos, ênfase, listas, links, citação, código
  inline, bloco de código). **Não** inclui sintaxe de bloco Produto/Oferta
  — isso é `UXE-003`/`UXE-004`. **Não** integra com `apps/admin`.
- `round-trip.mjs` e `fixture.md` (UXE-001) permanecem intocados — esta
  tarefa só adiciona `compare-corpus.mjs` e o diretório `corpus/`.

## Os dois corpora — e por que são separados

- **`corpus/persisted-current/`** — os 3 `bodyMdx` reais hoje persistidos
  no banco de desenvolvimento (ver `MANIFEST.md` no mesmo diretório para
  proveniência: id, slug, status). São dados de teste criados durante a
  implementação das tarefas, não um histórico editorial de produção — mas
  são conteúdo real e persistido, e o invariante "nada já persistido pode
  quebrar" se aplica a eles. Congelados como arquivos `.md` estáticos via
  consulta SQL somente-leitura; **nenhuma conexão com banco em tempo de
  execução deste spike**.
- **`corpus/representative-common-markdown/`** — fixtures controladas/
  sintéticas. Este corpus é sintético porque **o projeto ainda não possui
  histórico editorial real suficientemente rico** para cobrir sozinho a
  variedade de construções que o produto precisa preservar (a ausência de
  links/ênfase/listas ordenadas nos 3 artigos reais reflete como eles foram
  criados como dado de teste, não que essas construções estejam fora do
  que precisa ser preservado). Não deve ser confundido com uma amostra de
  produção.

## Construções cobertas e critério de inclusão

Critério aplicado (não é "toda a especificação CommonMark", nem só
"plausibilidade em review de produto"): subconjunto mínimo de Markdown
comum que (a) o pipeline público aceita hoje (`format: 'md'`, CommonMark
core, sem GFM — `apps/fastcompre` não tem `remark-gfm` instalado) e (b) é
uma primitiva estrutural básica de texto corrido, não um recurso
avançado/de nicho.

Transformers/nodes oficiais usados — **nenhum customizado**:

| Construção | Transformer | Node(s) | Dependência |
|---|---|---|---|
| Heading (H1–H6) | `HEADING` | `HeadingNode` | `@lexical/rich-text` (já existente) |
| Citação | `QUOTE` | `QuoteNode` | `@lexical/rich-text` (já existente) |
| Lista não ordenada | `UNORDERED_LIST` | `ListNode`, `ListItemNode` | `@lexical/list` (já existente) |
| Lista ordenada | `ORDERED_LIST` | `ListNode`, `ListItemNode` | `@lexical/list` (já existente) |
| Link | `LINK` | `LinkNode` | `@lexical/link` (já existente) |
| Negrito | `BOLD_STAR` | — | núcleo do Lexical |
| Itálico | `ITALIC_STAR` | — | núcleo do Lexical |
| Código inline | `INLINE_CODE` | — | núcleo do Lexical (sem node novo) |
| Bloco de código (fenced) | `CODE` | `CodeNode` | **`@lexical/code-core@0.49.0` (nova)** |

`@lexical/code-core` foi confirmada, por leitura direta do código-fonte
instalado de `@lexical/markdown@0.49.0`, como a dependência oficial que o
próprio transformer `CODE` declara (`dependencies: [CodeNode]`) — não é
`@lexical/code` (nome de pacote antigo em versões anteriores do Lexical).
Nenhuma configuração de tema/highlight foi adicionada — o spike é headless,
não renderiza nada visualmente.

## Gaps documentados — não implementados nesta tarefa

- **Horizontal rule (`---`)**: o pipeline público aceita a sintaxe, mas
  `@lexical/markdown@0.49.0` não oferece transformer oficial no caminho de
  round-trip (`$convertFromMarkdownString`/`$convertToMarkdownString`) — a
  única referência a `horizontalRule` no pacote pertence a um mecanismo
  separado (atalhos de formatação ao vivo durante digitação), irrelevante
  para conversão de arquivo. Nenhum transformer customizado foi criado.
- **Imagem (`![alt](url)`)**: o pipeline público aceita a sintaxe, mas não
  existe `IMAGE` em nenhum lugar do código-fonte/tipos de
  `@lexical/markdown@0.49.0` — confirmado por busca direta, zero
  ocorrências. Não há `ImageNode` oficial em nenhum pacote `@lexical/*`.
  Resolver exigiria node e transformer customizados, fora de escopo aqui.

Nenhum dos dois gaps foi resolvido silenciosamente e nenhuma conclusão foi
tomada sobre se ficam fora do contrato definitivo — permanecem visíveis
para decisão até, no máximo, a `UXE-005` (Editorial Serialization
Contract).

## Executar

```
pnpm --filter @commerce-platform/spike-lexical-editorial compare-corpus
```

## Critério de fidelidade e catalogação de divergências

`compare-corpus.mjs` processa **todos** os arquivos dos dois corpora —
nunca para no primeiro erro ou divergência; cada arquivo roda no seu
próprio `try/catch`, e uma falha técnica isolada não impede a análise dos
demais. Para cada arquivo, o relatório (JSON, impresso no console) traz:
`file`, `corpus`, `byteIdentical`, `expectedConstructions` (por construção
presente no input), `unsupportedConstructsFound` (imagem/horizontal rule,
se aparecerem em algum arquivo), `divergence` (descrição + input/output
completos quando não idêntico), `classification`
(`formatting-only | semantic-loss | unsupported | error`) e
`needsDecision`.

A classificação é **só diagnóstica** — nunca torna um achado
automaticamente aceitável. A ausência isolada de newline final (padrão já
observado na UXE-001) é rotulada `formatting-only`, mas continua sendo
reportada com o diff completo, com `needsDecision: true` — nunca
normalizada para fabricar igualdade. O código de saída do script só
reflete falha técnica de execução (`classification: 'error'`); divergências
de conteúdo nunca decidem PASS/FAIL sozinhas — isso é decisão humana,
registrada fora deste script.
