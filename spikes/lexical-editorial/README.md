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

---

# UXE-003 — Sintaxe customizada versionável + transformers Lexical (Produto)

Escolhe e implementa, para este spike, a sintaxe versionada do bloco
editorial de Produto e o `MultilineElementTransformer`/`ElementNode`
correspondentes — a base sobre a qual `UXE-004` (validação completa de
round-trip/segurança) e `UXE-005` (gate que a consolida como Editorial
Serialization Contract normativo) vão trabalhar. Esta tarefa **não**
valida segurança, **não** integra com `apps/admin`/`apps/fastcompre`, e
**não** resolve os gaps abertos pela UXE-002 (lista aninhada, imagem,
horizontal rule).

## Gramática v1 — canônica

```
:::product
version: 1
productId: <uuid>
:::
```

- Opener `:::product` no início da linha, sem indentação (trailing
  whitespace tolerado). Opener indentado **não** casa com esta sintaxe —
  permanece Markdown comum, sem erro (ver cenário de controle abaixo).
- Corpo com exatamente 2 linhas, nesta ordem fixa: `version` primeiro,
  `productId` segundo. Nenhuma linha em branco interna. Nenhuma outra
  linha/campo.
- `version` só aceita o literal `1` nesta v1.
- `productId` validado como UUID (formato RFC 4122).
- Closer `:::` obrigatório, sozinho na linha (trailing whitespace
  tolerado).

## Payload do node — só `productId`

`ProductBlockNode extends ElementNode` carrega, como único estado
editorial de domínio, `productId` — via `createState`/`$getState`/
`$setState` do próprio Lexical (mesmo padrão de `codeFenceState`/
`listMarkerState` em `@lexical/markdown`). Nenhum `offerId`, nome, preço,
link ou snapshot é armazenado — `ArticleProduct` continua sendo a única
fonte estrutural de verdade sobre Produtos referenciados pelo Artigo;
Oferta continua resolvida dinamicamente a partir do Produto, nunca
persistida no bloco.

`version: 1` da gramática Markdown pertence exclusivamente a este
transformer/parser — nunca é armazenado como estado do node. Isso é
conceitualmente distinto da propriedade `version` que o próprio
`LexicalNode.exportJSON()` grava em todo node (versionamento interno do
formato de serialização JSON do Lexical), sem nenhuma relação com a
versão desta sintaxe. `createState.parse` aqui é só normalização de tipo,
nunca mecanismo de rejeição de gramática — toda validação de conteúdo
acontece em `PRODUCT_BLOCK.replace`, antes do node ser criado.

Confirmado por execução real: o JSON serializado do node namespacia
estado customizado sob a chave `$` (`NODE_STATE_KEY`, definida em
`LexicalConstants.ts`) — ou seja, `exportJSON()` do node produz
`{ children, direction, format, indent, type: 'product-block', version: 1, $: { productId: '<uuid>' } }`.
Os campos `children`/`direction`/`format`/`indent`/`version` (fora de `$`)
são metadados estruturais do próprio `ElementNode`/Lexical, não estado de
domínio do bloco.

## Falha explícita e determinística — não fallback silencioso

Decisão fechada no desenho: uma vez que o opener exato `:::product` foi
reconhecido, qualquer desvio da gramática acima — incluindo bloco sem
fechamento — é uma falha explícita (`ProductBlockSyntaxError` lançado
dentro de `PRODUCT_BLOCK.replace`), nunca um retorno `false`/fallback
silencioso para Markdown comum. A exceção se propaga por
`editor.update()` até o `onError` do editor headless, interrompendo a
importação de forma visível.

Mecanismo confirmado por leitura direta de `MarkdownImport.ts`
(`@lexical/markdown@0.49.0`) e por execução real: `regExpEnd` é declarado
como `{ optional: true, regExp: /^:::[ \t]*$/ }`, o que faz
`$importMultiline` invocar `replace` mesmo ao atingir o fim do documento
sem encontrar o closer — com `endMatch` ausente (`null`) nesse caso.
`PRODUCT_BLOCK.replace` verifica `!endMatch` e lança
`ProductBlockSyntaxError` explicitamente para o cenário de bloco sem
fechamento, exatamente pelo mesmo mecanismo usado para os demais desvios
de gramática — sem nenhuma varredura pós-importação do Markdown
serializado.

A validação por posição fixa (linha 1 = `version`, linha 2 = `productId`,
contagem exata de 2 linhas) cobre, sem checagens adicionais, campo extra
ou linha em branco interna (contagem ≠ 2), ordem trocada (cada linha só
casa com o regex da posição esperada) e campo duplicado do tipo errado na
posição errada.

## Arquivos

- `product-block-transformer.mjs` — `ProductBlockNode`, `PRODUCT_BLOCK`
  (`MultilineElementTransformer`) e `ProductBlockSyntaxError`.
- `product-block-round-trip.mjs` — prova dedicada, independente de
  `compare-corpus.mjs`. 11 cenários: 2 positivos (bloco isolado; bloco
  cercado por Markdown comum — ambos provam round-trip íntegro e que o
  estado editorial do node contém somente `productId`), 1 de controle
  (opener indentado permanece Markdown comum) e 8 negativos (version
  ausente/desconhecida, productId ausente/UUID inválido, campo/linha
  extra, campo duplicado, ordem inválida, bloco sem fechamento — todos
  devem lançar `ProductBlockSyntaxError`).

`round-trip.mjs`, `compare-corpus.mjs` e os dois corpora da UXE-002
permanecem intocados.

## Executar

```
pnpm --filter @commerce-platform/spike-lexical-editorial product-block-round-trip
```

## Critério de sucesso

Diferente de `compare-corpus.mjs` (cujo papel é só diagnóstico), este
runner tem critério real de PASS/FAIL por cenário — é exatamente isso que
a prova precisa demonstrar: a sintaxe é reconhecida corretamente quando
válida, ignorada quando não casa com o opener, e rejeitada explicitamente
quando o opener casa mas o corpo é inválido. Mesmo assim, nunca para no
primeiro cenário que falha — todos os 11 rodam sempre, e o relatório final
(JSON, impresso no console) lista todos os resultados.

---

# UXE-004 — Round-trip 2: bloco Produto/Oferta → sintaxe → pipeline FastCompre → componente público

Prova o ciclo completo `bodyMdx → Lexical → bodyMdx → remark/MDX →
resolução → renderização`, ou seja: que o bloco `:::product` da `UXE-003`
sobrevive ao pipeline público real (`@mdx-js/mdx` com `format: 'md'`, as
mesmas versões de produção — ver `Dependências`), que só `productId`
atravessa a fronteira até o componente de renderização, e que Produto/Oferta
são sempre resolvidos a partir da projeção estrutural real do Artigo
(nunca de uma tabela global). Esta tarefa **não** toca `apps/fastcompre`
nem `apps/admin`, **não** decide a UI de produção do bloco, e **não**
resolve os gaps abertos pela UXE-002.

## Gramática compartilhada — extração mecânica

`product-block-grammar.mjs` (novo) concentra a validação pura da gramática
`:::product` v1 (regexes, `parseProductBlockBody`, `serializeProductBlock`,
`ProductBlockSyntaxError`), extraída sem nenhuma alteração de semântica de
`product-block-transformer.mjs` (UXE-003). O transformer Lexical e o novo
`product-block-remark-plugin.mjs` importam e usam a **mesma** função de
validação — nunca duas implementações independentes da mesma gramática. A
prova de que a extração não mudou comportamento é a repetição integral dos
11 cenários de `product-block-round-trip.mjs`, que continuam 11/11 após a
extração (ver `Testes e verificações`).

## Como o remark plugin reconhece o bloco

Sob `format: 'md'` (a mesma flag do pipeline real, `compile-article-body.ts`),
`:::product`/`version: 1`/`productId: <uuid>`/`:::` não tem significado
sintático próprio — quatro linhas consecutivas sem linha em branco colapsam,
pela regra padrão do CommonMark, em um único parágrafo mdast com um nó
`text` cujo valor preserva as quebras internas (`\n`). `remarkProductBlock`
(`product-block-remark-plugin.mjs`) visita parágrafos com essa forma,
separa as linhas, valida com `OPENER_REGEXP`/`CLOSER_REGEXP` (gramática
compartilhada) e, em caso de sucesso, substitui o nó por um
`mdxJsxFlowElement { name: 'ProductBlock', attributes: [{ name: 'productId', value }] }`.
Um parágrafo cuja primeira linha não casa com o opener é ignorado, sem
nenhuma alteração — mesma garantia de não interferência já provada pela
UXE-002 (cenário `02` da matriz abaixo, agora com o corpus real reprocessado
com o plugin presente).

Fail-closed simétrico à UXE-003: opener reconhecido sem closer válido na
mesma unidade (parágrafo) lança `ProductBlockSyntaxError`, que se propaga
até rejeitar a Promise de `evaluate()` — nunca um fallback silencioso.

## Só `productId` atravessa — como é provado

Duas verificações independentes, nunca uma inferência sobre o HTML final:

1. **Estrutural, antes de qualquer avaliação MDX**: o cenário `11` da
   matriz inspeciona a árvore mdast produzida só pelo `remarkProductBlock`
   (via `unified`+`remark-parse`, sem `@mdx-js/mdx`) e afirma
   `mdxJsxFlowElement.attributes.length === 1` com
   `attributes[0].name === 'productId'`.
2. **Tentativas de contrabando**: entradas que tentam colar um campo extra
   (`name: Produto Fake`) ou quebrar a validação posicional do `productId`
   são rejeitadas por `parseProductBlockBody` antes de qualquer
   `mdxJsxFlowElement` ser construído — nunca chegam a existir como AST.

## Resolução — sempre da projeção estrutural real do Artigo

`product-block-component.mjs` (`ProductBlock`) recebe `productId` e uma
função `resolveProduct` injetada externamente — nunca importa uma fonte de
dados própria. O runner só injeta
`createScopedResolver(REAL_PROJECTION_BY_PRODUCT_ID)`
(`product-block-real-projection.fixture.mjs`), escopada a **um único**
Artigo real. Isso é o que torna o cenário `04` uma prova estrutural, não
uma coincidência: um `productId` real, existente, mas vinculado a outro
Artigo real, resolve `not-found` porque o resolver nem tem acesso ao
restante do universo de Produtos — não porque uma checagem manual o
excluiu.

`not-found` aqui (`data-product-block-status="not-found"`) é só um
marcador de diagnóstico para os testes deste spike — a decisão de UI de
produção para "produto não encontrado" fica para o contrato/implementação
posterior.

## Dado real congelado — e o que ele NÃO prova

`product-block-real-projection.fixture.mjs` congela, a partir de uma
consulta SQL somente-leitura real (documentada no cabeçalho do próprio
arquivo, executada localmente em ambiente de desenvolvimento em
2026-08-20): o Artigo `jbl-tune-520bt-vale-a-pena`
(`29c4577f-206d-4f57-8aef-eac60985f036`) com seus dois `ArticleProduct`
reais e Ofertas reais, e um terceiro Produto real
(`Carregador USB-C 65W GaN`) de fato vinculado a outro Artigo real, usado
só para a prova de `not-found`. São dados de ambiente de
desenvolvimento/teste — não um histórico editorial de produção, mesma
ressalva já feita para o corpus `persisted-current` da UXE-002.

Todos os registros disponíveis no ambiente pertencem ao mesmo `siteId`
— nenhum segundo Site foi criado para este spike. Por isso a UXE-004
comprova empiricamente **isolamento por Artigo/projeção**, não isolamento
de Site: isso continua sendo uma propriedade herdada do contrato de
tenancy da API pública (`TenantContext`, `PublicArticle.products[]` já
escopado por Site+Artigo), não testada por esta fixture.

`uxe-004-real-projection.json`, na raiz do repositório, é só o artefato
operacional bruto da consulta — nunca importado em runtime por nenhum
arquivo deste spike, e não deve ser commitado.

## Achado desta rodada — corrige a investigação anterior (link `javascript:`)

A investigação da UXE-004 (antes da implementação) havia testado o link
`[texto](javascript:alert(1))` contra um protótipo descartável rodando
`react@18.3.1`, fora do repositório, e observado que o href cru
sobrevivia (`href="javascript:alert(1)"`). Ao implementar esta tarefa
usando as versões REAIS de produção (`react@19.2.4`/`react-dom@19.2.4`,
confirmadas em `pnpm-lock.yaml`), o resultado é diferente: o próprio
React 19 já neutraliza esse href em tempo de renderização, substituindo-o
por um stub que lança
`"React has blocked a javascript: URL as a security precaution."`. Ou
seja, a versão real de produção já mitiga esse comportamento — isso não
estava confirmado antes desta implementação, e a UXE-004 não introduz nem
altera essa mitigação (cenário `10`: `remarkProductBlock` não muda esse
comportamento, com ou sem o plugin presente). Fica registrado aqui como
achado corrigido, não como algo que esta tarefa corrigiu.

## Matriz de cenários (`product-block-round-trip-full-cycle.mjs`)

| # | Cenário | Prova |
|---|---|---|
| 01 | Round-trip básico com dado real | Lexical import/export byte-idêntico; MDX renderiza nome/ofertas reais |
| 02 | Corpus comum sem interferência | 5 casos de Markdown comum idênticos com/sem o plugin |
| 03 | Blocos repetidos, mesmo `productId` | 3 ocorrências → 3 nodes/elementos independentes, sem dedup |
| 04 | UUID real, não vinculado ao artigo | `not-found`; nenhum dado de nenhum produto vaza |
| 05 | Bloco sem fechamento (remark) | Fail-closed, `ProductBlockSyntaxError` |
| 06 | Simetria Lexical × remark | 6 corpos malformados rejeitados identicamente nas duas camadas |
| 07 | Expressão `{alert(1)}` | Inerte, texto literal |
| 08 | `import`/`export` | Inerte, texto literal escapado |
| 09 | HTML bruto (`<script>`, `onerror`) | Descartado, nunca chega ao HTML final |
| 10 | Link `javascript:` (baseline) | Comportamento idêntico com/sem o plugin (ver achado acima) |
| 11 | Contrabando de atributo extra | Rejeitado antes da AST; sucesso tem exatamente 1 atributo (`productId`) |
| 12 | Múltiplos produtos diferentes | Os 2 `ArticleProduct` reais do artigo resolvem e renderizam corretamente |
| 13 | Ciclo completo, conteúdo misto | Round-trip Lexical + renderização MDX corretos sobre o mesmo documento |

Mesma filosofia PASS/FAIL de `product-block-round-trip.mjs` — nunca a
diagnóstica de `compare-corpus.mjs`. Nunca para no primeiro cenário que
falha.

## Arquivos

- `product-block-grammar.mjs` — gramática pura, compartilhada.
- `product-block-transformer.mjs` — inalterado em comportamento; passa a
  delegar a validação para o módulo de gramática.
- `product-block-remark-plugin.mjs` — plugin remark, gramática
  compartilhada, `mdxJsxFlowElement` com só `productId`.
- `product-block-component.mjs` — componente de renderização do spike
  (não é a UI de produção).
- `product-block-real-projection.fixture.mjs` — dado real congelado, com
  proveniência documentada.
- `product-block-round-trip-full-cycle.mjs` — prova PASS/FAIL do ciclo
  completo, 13 cenários.

`product-block-round-trip.mjs`, `round-trip.mjs`, `compare-corpus.mjs` e os
corpora da UXE-002 permanecem intocados.

## Dependências novas

`@mdx-js/mdx@3.1.1`, `react@19.2.4`, `react-dom@19.2.4`,
`unist-util-visit@5.1.0` — todas pinadas exatamente na mesma versão
resolvida em `pnpm-lock.yaml` para `apps/fastcompre` (confirmado antes de
adicionar), nunca uma versão diferente "equivalente".

## Executar

```
pnpm --filter @commerce-platform/spike-lexical-editorial product-block-round-trip-full-cycle
```

## Testes e verificações executados

- `product-block-round-trip.mjs` (UXE-003, intocado): **11/11** cenários
  passando após a extração da gramática compartilhada.
- `round-trip.mjs` (UXE-001, intocado): sem regressão — mesmas 5
  construções básicas identificadas, mesma observação de
  `byte-identical: false` já conhecida.
- `compare-corpus.mjs` (UXE-002, intocado): sem regressão — mesma
  classificação por arquivo já conhecida (3 arquivos `persisted-current`
  byte-idênticos; gaps de `representative-common-markdown` inalterados).
- `product-block-round-trip-full-cycle.mjs` (novo, UXE-004): **13/13**
  cenários passando.
