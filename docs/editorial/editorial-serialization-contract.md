# Editorial Serialization Contract — UXE-005

> Documento normativo, gate explícito do backlog `UX-Implementation-Backlog.md` (tarefa `UXE-005`). Consolida os resultados reais de `UXE-002`, `UXE-003` e `UXE-004` (spikes versionados em `spikes/lexical-editorial/`) em decisões explícitas sobre os seis pontos exigidos pelo backlog. Pré-requisito bloqueante de `UXE-006` (integração do Lexical no Admin) e `UXE-017` (plugin/transform de produção no pipeline MDX do FastCompre) — nenhuma das duas pode começar sem este documento fechado.
>
> Este documento não implementa nada — é a fonte normativa que `UXE-006` a `UXE-021` devem respeitar. Convenção de leitura usada em cada ponto:
> - **GARANTIA NORMATIVA (MUST)** — comprovado pelos spikes, vinculante para toda implementação futura; alterar isso é decisão arquitetural, não detalhe de implementação.
> - **LIMITAÇÃO CONHECIDA** — gap real, documentado, **não** uma proibição permanente de produto. Ausência de solução hoje ≠ decisão de nunca resolver.
> - **RESPONSABILIDADE FUTURA** — decisão real que este gate deliberadamente não toma; fica explicitamente para a tarefa indicada.

## 1. Invariantes herdados (não decididos aqui)

Este contrato não cria nem reabre nenhum destes — apenas os reafirma como fronteira que toda implementação de `UXE-006+`/`UXE-017+` deve respeitar:

- `Article.bodyMdx` permanece `String`, sem migração de formato.
- `ArticleProduct` é a única fonte estrutural de verdade sobre o vínculo Artigo↔Produto.
- Isolamento por Site é inegociável (`Architecture.md`, princípio 1).
- O pipeline público compila `bodyMdx` via `@mdx-js/mdx` com `format: 'md'` — nenhuma extensão futura pode reabrir esse comportamento de segurança para conteúdo comum.
- `packages/contracts` é hoje o único package compartilhado do MVP; qualquer package novo é decisão arquitetural explícita, não consequência automática de uma tarefa de UI/editor.

## 2. Ponto 1 — Round-trip do Markdown existente

**GARANTIA NORMATIVA (MUST):** o ciclo `bodyMdx → Lexical → bodyMdx` é byte-idêntico (módulo ausência/presença de newline final, tratada como divergência `formatting-only`, nunca como perda de conteúdo) **para o subconjunto de Markdown efetivamente exercitado pela UXE-002**: heading (H1–H6), citação (blockquote), lista não-ordenada em nível único, lista ordenada em nível único, link, negrito, itálico, código inline, bloco de código cercado (fenced). Esta garantia não se estende, por definição, a nenhuma construção fora deste subconjunto — em particular lista aninhada, imagem e horizontal rule (ver §5).

**Evidência real:** os 3 `bodyMdx` atualmente persistidos no ambiente de desenvolvimento (`corpus/persisted-current/`, incluindo os artigos reais `jbl-tune-520bt-vale-a-pena` e `carregador-usb-c-65w-gan-vale-a-pena`) tiveram round-trip **byte-idêntico**, sem nenhuma divergência — nem `formatting-only`. Do corpus sintético `representative-common-markdown/` (8 arquivos, cobrindo o subconjunto acima), 7 tiveram divergência exclusivamente `formatting-only`; o oitavo (`03-lists.md`) teve divergência `semantic-loss` por conter lista aninhada — tratado em §5, não nesta garantia.

**Fechado.**

## 3. Ponto 2 — Sintaxe customizada versionável (`:::product`)

**GARANTIA NORMATIVA (MUST):** a gramática v1 do bloco editorial de Produto é:

```
:::product
version: 1
productId: <uuid>
:::
```

Regras vinculantes: opener `:::product` sem indentação, início de linha; corpo com exatamente 2 linhas em ordem fixa (`version` depois `productId`); `version` só aceita o literal `"1"` nesta versão; `productId` validado como UUID (RFC 4122); closer `:::` obrigatório. Qualquer desvio da gramática, uma vez que o opener exato foi reconhecido — incluindo bloco sem fechamento — é falha explícita e determinística (`ProductBlockSyntaxError`), **nunca** um fallback silencioso para Markdown comum ou para um bloco parcialmente interpretado. Este comportamento fail-closed é vinculante para qualquer implementação futura da gramática, Lexical ou MDX.

**Distinção obrigatória, para nunca ser confundida em implementações futuras:** o campo `version: 1` pertence exclusivamente à gramática Markdown deste bloco — nunca é armazenado como estado do node Lexical. Isso é conceitualmente distinto do campo `version` que o próprio `LexicalNode.exportJSON()` grava em **todo** node Lexical (versionamento interno do formato de serialização JSON do Lexical em si, sem nenhuma relação com esta sintaxe). Qualquer código futuro que precise evoluir a gramática do bloco (v2, v3...) versiona `version: <n>` dentro do `:::product`; nunca reaproveita ou lê o `version` estrutural do JSON do Lexical para essa finalidade.

**Evidência real:** `product-block-grammar.mjs` (commitado em `spikes/lexical-editorial/`) é a implementação normativa desta gramática, validada por 11/11 cenários em `product-block-round-trip.mjs` (2 positivos, 1 de controle, 8 negativos) e reconfirmada, após extração mecânica na UXE-004, ainda 11/11.

**Fechado.**

## 4. Ponto 3 — Import/export Lexical

**GARANTIA NORMATIVA (MUST):** `ProductBlockNode` (`ElementNode` customizado) persiste, como único estado editorial de domínio, `productId`. Nenhuma implementação futura pode adicionar a este node — nem ao seu payload serializado, nem a qualquer estrutura equivalente que venha a substituí-lo — nenhum dos seguintes: nome do Produto, preço, link de afiliado, disponibilidade (`inStock`), `offerId`, ou qualquer outro snapshot de dado de Produto/Oferta. A única referência estrutural permitida é `productId`; tudo o mais é resolvido dinamicamente no momento da renderização (§5).

`ProductBlockNode` não implementa `createDOM`/`updateDOM` — decisão arquitetural, não omissão: em modo headless (`createHeadlessEditor`), a reconciliação de DOM nunca roda (`shouldSkipDOM = editor._headless || rootElement === null`, sempre verdadeiro nesse modo), e a base `LexicalNode` já lança um erro claro se esses métodos forem invocados sem implementação. Qualquer integração futura que precise renderizar este node visualmente dentro de um editor real (`UXE-006`+) implementa `createDOM`/`updateDOM` **nesse momento**, não antes.

**Evidência real:** `product-block-transformer.mjs`, mesmos 11/11 cenários do §3, mais a inspeção direta de `exportJSON()` confirmando que o único estado sob a chave `$` (namespace de `NodeState` do Lexical) é `productId`.

**Fechado.**

## 5. Ponto 4 — Resolução de Produto/Oferta

**GARANTIA NORMATIVA (MUST):** a resolução de Produto/Oferta a partir de um `productId` referenciado no bloco é **sempre** derivada da projeção estrutural autorizada do Artigo — nunca de uma consulta/lookup global a uma tabela de Produtos. `ArticleProduct` continua sendo a única fonte estrutural de verdade sobre o vínculo; a Oferta continua resolvida dinamicamente a partir do Produto vinculado, nunca embutida na sintaxe. Um `productId` sintaticamente válido, real, porém não vinculado ao Artigo que contém o bloco, **deve** resolver a um estado explícito de "não encontrado" — nunca a fallback para outro Produto, nunca a vazamento de dado de outro Artigo.

**Evidência real:** `product-block-round-trip-full-cycle.mjs` (UXE-004) provou isso com dado real do ambiente de desenvolvimento — o artigo `jbl-tune-520bt-vale-a-pena` (`ArticleProduct` reais, com Ofertas reais) resolvendo corretamente, e o produto real `Carregador USB-C 65W GaN` (vinculado a um artigo diferente) resolvendo `not-found` quando referenciado no bloco deste artigo, sem vazar seu próprio nome nem o de nenhum outro produto da projeção.

**LIMITAÇÃO CONHECIDA (escopo da evidência):** todos os dados reais disponíveis no ambiente de desenvolvimento pertencem ao mesmo `siteId` — a UXE-004 comprovou empiricamente isolamento **por Artigo/projeção**, não isolamento de **Site**. Isolamento de Site continua sendo uma propriedade herdada do contrato de tenancy da API pública (`TenantContext`, `PublicArticle.products[]` já escopado por Site+Artigo) — não foi, e não deve ser apresentado como, algo testado empiricamente por este gate.

**RESPONSABILIDADE FUTURA:** a implementação de produção (`UXE-018`) resolve a referência contra a API pública no momento da renderização/revalidação, reaproveitando o que `PublicArticle.products[]` já expõe (sem novo endpoint) — compatível com o mecanismo aqui provado, mas a implementação em si permanece tarefa futura, não coberta por este gate.

**Fechado como mecanismo; implementação de produção é responsabilidade de `UXE-018`.**

## 6. Ponto 5 — Renderização pública correspondente

**GARANTIA NORMATIVA (MUST) — semântica normativa do bloco:** a posição de um bloco `:::product` dentro de `Article.bodyMdx` **é** a posição editorial onde Produto/Oferta devem ser renderizados no fluxo do artigo. O bloco não é uma referência auxiliar a ser exibida em outro lugar da página — sua posição no corpo é normativa. Isso é o que a UXE-004 provou ser tecnicamente viável, pela primeira vez neste ciclo, via `mdxJsxFlowElement`/`components` no pipeline `@mdx-js/mdx` real.

**RESPONSABILIDADE FUTURA — estratégia de transição:** este gate **não** decide a estratégia concreta de transição da seção estática de Produtos que existe hoje no FastCompre (`article.products.map(...)`, renderizada ao final do artigo, fora do corpo MDX). `UXE-017`/`UXE-018` devem decidir conscientemente — e registrar essa decisão explicitamente, não implicitamente — se essa seção estática é removida, substituída pelo bloco inline, ou mantida temporariamente durante uma transição. A única restrição vinculante que este gate impõe sobre essa decisão futura: **o estado final não pode produzir duplicação permanente ou acidental do mesmo Produto/Oferta** (uma vez inline via bloco, e novamente na seção estática, para o mesmo artigo, sem que isso seja uma escolha editorial deliberada e visível).

**LIMITAÇÃO CONHECIDA:** nenhuma UXE-00X até agora tocou `apps/fastcompre` — a viabilidade técnica do mecanismo de renderização inline foi provada em ambiente de spike isolado, nunca contra a implementação de produção real.

**Fechado quanto à semântica normativa; estratégia de transição é responsabilidade explícita de `UXE-017`/`UXE-018`.**

**ADENDO (UXE-018) — decisão registrada da estratégia de transição da seção estática:** em cumprimento à "RESPONSABILIDADE FUTURA" acima, a `UXE-018` registra explicitamente a seguinte política de composição entre o bloco `:::product` inline e a seção estática de Produtos existente em `apps/fastcompre` (`article.products.map(...)`, renderizada ao final do artigo):

- Artigo sem nenhum bloco `:::product` no corpo preserva a seção estática atual, sem alteração de comportamento.
- Um Produto referenciado inline por um bloco `:::product` não deve ser repetido na seção estática do mesmo Artigo — evita exatamente a duplicação que este gate já proibia como estado final (ver "RESPONSABILIDADE FUTURA" acima).
- Um Produto vinculado ao Artigo via `ArticleProduct`, mas não referenciado por nenhum bloco inline, continua elegível para aparecer na seção estática — a existência de um bloco inline em algum lugar do corpo não remove a seção estática inteira.
- A implementação física desta composição (o código em `apps/fastcompre/.../page.tsx` que efetivamente filtra a seção estática pelos Produtos já referenciados inline) é responsabilidade da `UXW-011` — nem a `UXE-017` nem a `UXE-018` alteram `page.tsx` para isso.

**Fechado quanto à política de composição acima; implementação física em `page.tsx` permanece responsabilidade explícita de `UXW-011`.**

## 7. Ponto 6 — Segurança/regressão

**GARANTIA NORMATIVA (MUST):** nenhuma superfície de injeção nova foi identificada através da sintaxe `:::product`/`mdxJsxFlowElement` sob o pipeline real (`format: 'md'`, mesma flag de `compile-article-body.ts`). Comprovado especificamente contra: expressão JS (`{alert(1)}`), `import`/`export` como statement, HTML bruto (`<script>`, atributos `onerror`) — todos permanecem inertes, com ou sem o plugin de bloco presente. Tentativa de contrabando de atributo extra na AST (`mdxJsxFlowElement.attributes`) é rejeitada pela gramática (§3) antes de a AST sequer existir — comprovado que, no caminho de sucesso, `attributes` tem exatamente 1 entrada (`productId`).

O comportamento **fail-closed** da gramática (§3) é também, por construção, a garantia de regressão: qualquer entrada que desvie da gramática v1 aprovada é rejeitada de forma determinística nas duas camadas (transformer Lexical e remark plugin), nunca processada como bloco parcial ou texto solto.

**Achado registrado, não introduzido por esta tarefa:** o link `[texto](javascript:alert(1))` já é neutralizado pelo próprio `react-dom@19.2.4` em tempo de renderização (versão real de produção, confirmada em `pnpm-lock.yaml`) — comportamento preexistente do React, não uma mitigação desta sintaxe. Comprovado que `remarkProductBlock` não altera esse comportamento, para nenhum dos dois lados.

**LIMITAÇÃO CONHECIDA:** toda a verificação de segurança acima foi feita em ambiente de spike, nunca contra a implementação de produção real — `UXE-020` (backlog) já existe especificamente para repetir esta verificação contra a implementação real após `UXE-017`/`UXE-018`.

**Fechado.**

## 8. Compartilhamento físico da gramática entre Admin e FastCompre

**GARANTIA NORMATIVA (MUST):** deve existir, a qualquer momento, **uma única especificação normativa** da gramática `:::product` (este documento, mais a suíte de testes que a verifica) — nunca duas definições que possam divergir silenciosamente. O comportamento do transformer Lexical (consumido por `apps/admin` a partir de `UXE-006`) e do plugin/transform MDX (consumido por `apps/fastcompre` a partir de `UXE-017`) deve ser comprovadamente equivalente frente a essa especificação — mesma aceitação, mesma rejeição, mesmo comportamento fail-closed.

**RESPONSABILIDADE FUTURA:** este gate não decide a localização física do módulo de gramática quando os dois consumidores de produção existirem. Não é criado, nesta tarefa, nenhum `packages/editorial-syntax` (ou equivalente) — `packages/contracts` continua sendo o único package compartilhado do MVP, e qualquer novo package permanece decisão arquitetural explícita, tomada quando `UXE-006` e `UXE-017` estiverem prontas para consumir a gramática de verdade, não antecipada aqui. Igualmente, este gate **não** normatiza duas cópias físicas mantidas manualmente como solução permanente — se a implementação de produção optar por duplicar fisicamente o módulo como passo intermediário, isso só é aceitável enquanto ambas as cópias forem verificadas contra a mesma suíte normativa de testes, nunca como estado final tácito.

## 9. Gaps conhecidos — limitações, não proibições

Nenhum dos três itens abaixo é uma decisão de que o produto nunca terá a construção correspondente. São limitações técnicas hoje, sobre round-trip/capacidade via `@lexical/markdown@0.49.0` — decisão de produto sobre se/quando resolver cada uma permanece em aberto, para quando (e se) alguma tarefa do backlog exigir.

- **Lista aninhada — `semantic-loss` conhecida.** `@lexical/markdown@0.49.0` achata sub-itens ao nível do item pai no round-trip (comprovado em `03-lists.md`, UXE-002). `UXE-006` lista "lista" no escopo do editor base sem distinguir nível — se listas aninhadas forem necessárias, a resolução técnica (transformer customizado, análogo ao de `:::product`) é responsabilidade de quem primeiro precisar disso, não decidida aqui.
- **Imagem — gap de capacidade, não de fidelidade.** Não existe `ImageNode`/transformer oficial em nenhum lugar de `@lexical/markdown@0.49.0` (confirmado por busca direta no código-fonte). `UXE-010` (upload/inserção de imagem) já existe no backlog como fluxo próprio, independente de round-trip Markdown puro. Este gate **não determina antecipadamente** que `UXE-010` precisará de um spike equivalente à UXE-003 — apenas registra que qualquer solução de imagem que `UXE-010` adotar deve respeitar este Serialization Contract e resolver explicitamente sua própria representação/persistência (seja via sintaxe Markdown padrão `![alt](url)`, seja via node/transformer customizado), decisão que cabe a quem implementar `UXE-010`. **Atualização:** a persistência de largura (`width`) foi decidida no âmbito da `UXE-022` — ver §10. Numa rodada de ampliação de escopo posterior, ainda dentro da mesma `UXE-022`, a decisão foi estendida para também admitir a persistência conjunta de `width` e `height` (nunca `height` isolado) — ver §10 atualizado. As demais capacidades de imagem (crop, galeria, redimensionamento por outra unidade além de `px`, etc.) permanecem como gap em aberto, sem urgência atribuída.
- **Horizontal rule (`---`) — gap de capacidade, não de fidelidade.** O pipeline público aceita a sintaxe; `@lexical/markdown@0.49.0` não oferece transformer oficial no caminho de round-trip de arquivo. Nenhuma tarefa do backlog atual exige horizontal rule como requisito de produto — permanece um gap não resolvido, sem urgência atribuída.

## 10. Extensão da gramática de imagem — persistência de largura e altura (`width`/`height`)

> Decisão registrada no âmbito da `UXE-022` (ampliação de escopo autorizada pelo Product Owner), resolvendo parcialmente o gap "Imagem" do §9. Não é um dos seis pontos originais exigidos pela `UXE-005` — por isso não é numerado como "Ponto", ao contrário dos §§2 a 7. Continua sujeita a todos os invariantes do §1, em particular `Article.bodyMdx` permanece `String` e `format: 'md'` não é reaberto para conteúdo comum. Esta versão do §10 substitui integralmente a versão anterior (só `width`) — a decisão foi ampliada, numa rodada posterior ainda dentro da mesma `UXE-022`, para também admitir a persistência conjunta de `width` e `height`.

**GARANTIA NORMATIVA (MUST) — sintaxe v1, duas formas:**

```
![alt](<url>){width=N}
![alt](<url>){width=N height=M}
```

- **Independência entre reconhecimento da imagem e da extensão:** inalterada — o reconhecimento de qualquer uma das duas formas (ou sua ausência/invalidez) é independente do reconhecimento da imagem base; uma extensão ausente ou inválida nunca desfaz uma imagem Markdown já reconhecida. Evidência original (quatro casos com `{width=N}`) preservada; evidência adicional desta rodada (mesma técnica, mesma versão de `@mdx-js/mdx@3.1.1`, `format: 'md'`) para a forma combinada — ver §11.
- **Forma `{width=N}` (width-only)** — inalterada em relação à versão anterior deste contrato: imediatamente após a imagem, sem nenhum espaço, um trecho de texto que case **exatamente** essa forma — `N` inteiro decimal positivo, sem zero à esquerda, sem sinal, sem casas decimais, sem unidade, com `100 <= N <= 1200` — é reconhecido e consumido como a largura da imagem.
- **Forma `{width=N height=M}` (combinada, nova nesta rodada)** — imediatamente após a imagem, sem nenhum espaço, um trecho de texto que case **exatamente** essa forma: ordem fixa (`width` sempre antes de `height` — `{height=M width=N}` nunca casa), exatamente um espaço entre os dois pares `chave=valor`, mesmas regras de `N`/`M` da forma width-only (inteiro decimal positivo, sem zero à esquerda, sem sinal, sem casas decimais, sem unidade), com `100 <= N <= 1200` **e** `100 <= M <= 1200`.
- **Atomicidade da forma combinada:** se qualquer um dos dois valores (`N` ou `M`) estiver fora da faixa normativa, ou a forma não casar exatamente (ordem invertida, espaçamento diferente, atributo extra, etc.), a extensão inteira é rejeitada — nunca aplica só o eixo válido. Ex.: `{width=600 height=99999}` não vira "width=600, sem height" — vira "nenhuma extensão reconhecida"; o sufixo inteiro permanece texto literal, e a imagem base continua reconhecida normalmente (mesma semântica de sempre: rejeição de extensão nunca desfaz a imagem).
- **Os três (e só três) estados persistíveis normativos:** (1) nenhuma dimensão; (2) só `width`; (3) `width` **e** `height` juntos. **`height` isolado nunca é um estado persistível válido** — não existe forma de gramática `{height=M}`, e nenhum estado real de `Article.bodyMdx` pode conter `height` sem `width` (garantia estrutural, não só de gramática — ver também a implementação de `ImageNode.setDimensions`/`ImageNode.setWidth`, único par de mutadores capazes de gravar cada um desses três estados).
- `{width=N}`/`{width=N height=M}` são **opcionais** — ausência de extensão é gramática válida e produz exatamente o comportamento anterior a esta extensão.
- **Comportamento de rejeição da extensão (nunca da imagem):** inalterado e estendido às duas formas — qualquer conteúdo na posição da extensão que não case exatamente uma das duas formas acima **não é consumido**: a imagem permanece imagem, sem `width`/`height`, e esse conteúdo permanece como texto comum, imediatamente após a imagem, exatamente como foi escrito — nunca desfaz o reconhecimento da imagem, nunca é descartado silenciosamente, nunca lança erro (parsing/import). Um valor fora da faixa não é convertido/clampado durante parsing/import — é tratado como extensão não reconhecida, igual a qualquer outra forma inválida.
- `width`/`height` são os únicos atributos de dimensão suportados nesta versão. Nenhuma outra unidade (`px`, `%`, `rem`) é reconhecida.

**GARANTIA NORMATIVA (MUST) — renderização:**

- **Estado (2), só `width`:** inalterado em relação à versão anterior — `width` representa a largura desejada em CSS `px`; a renderização preserva a proporção **intrínseca** da própria imagem (derivada do arquivo real, nunca de um segundo valor persistido); a largura efetivamente exibida nunca ultrapassa a largura disponível do container, em nenhum breakpoint.
- **Estado (3), `width` e `height` juntos:** a renderização deve preservar a proporção **definida pelo par `width`/`height` persistido** — não necessariamente a proporção intrínseca real do arquivo de imagem — como garantia de resultado observável, em qualquer largura de container/breakpoint, incluindo containers mais estreitos que `width`. Esta garantia é **agnóstica de técnica/mecanismo de implementação** — não prescreve `aspect-ratio` CSS, atributos HTML nativos, nem qualquer outra abordagem específica; exige apenas o resultado visual descrito. (Uma implementação que só use os atributos HTML `width`/`height` nativos, sem nenhum mecanismo adicional, tipicamente NÃO satisfaz esta garantia assim que a imagem carrega — o navegador recalcula a proporção pela intrínseca real do arquivo decodificado, não pela persistida; ver evidência empírica em §11.)
- **Estado (1), nenhuma dimensão:** inalterado — preserva o comportamento existente antes desta extensão.
- Em todos os três estados, a largura efetivamente exibida nunca ultrapassa a largura disponível do container, em nenhum breakpoint.

**FORA DO ESCOPO NORMATIVO DESTE CONTRATO (explicitamente):** como uma interface de edição chega a persistir os três estados acima — em particular, qualquer regra de interação de UI que, ao editar só um eixo (por exemplo arrastar uma borda que só altera visualmente a largura), persista os dois valores juntos a partir da largura/altura correntemente efetiva ("pinar" o eixo não tocado) — é uma decisão de desenho de UI/UX da implementação (`UXE-022`), não deste contrato. Este contrato normatiza SÓ a gramática textual, os três estados persistíveis e a garantia de renderização de cada um — nunca como uma interface chega a produzir um `Article.bodyMdx` específico. Requisitos de interação (pointer, teclado, foco, papéis/atributos ARIA do controle de resize) pertencem inteiramente ao desenho de UI/UX da `UXE-022`, não a este contrato.

**GARANTIA NORMATIVA (MUST) — fonte única das primitivas de gramática:** análogo ao §8 para `:::product` — `packages/editorial` é a fonte física única das primitivas normativas puras desta gramática (parsing, serialização, validação — incluindo a validação das faixas 100–1200 de cada eixo e a atomicidade da forma combinada). Nenhuma segunda implementação manual e paralela dessas primitivas é aceitável como estado final, nem mesmo temporariamente, salvo verificada contra a mesma suíte normativa (mesma ressalva já registrada no §8). O transformer Lexical (Admin) e os adapters remark/MDX de cada pipeline (Preview do Admin, FastCompre) permanecem locais a cada consumidor.

**GARANTIA NORMATIVA (MUST) — equivalência obrigatória entre consumidores:** os três pontos de consumo — transformer Lexical (Admin), pipeline MDX do Preview do Admin, pipeline MDX do FastCompre — devem produzir resultado comprovadamente equivalente frente à gramática acima, para o mesmo corpus de linhas de entrada, incluindo a forma combinada: mesma imagem reconhecida em todos os casos; mesmos `width`/`height` extraídos quando a extensão é válida (em qualquer uma das duas formas); mesmo texto literal remanescente quando a extensão não é reconhecida. Comprovado pela mesma suíte/corpus normativo de testes (`IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS`, `packages/editorial`) — não pela mesma implementação física de integração.

**LIMITAÇÃO CONHECIDA:** esta extensão não introduz nenhuma outra capacidade de imagem (crop, galeria, redimensionamento por outra unidade, texto alternativo assistido, etc.) — permanecem gaps em aberto, sem urgência atribuída, nos mesmos termos já registrados no §9.

**Evidência:** pipeline de produção real (`@mdx-js/mdx@3.1.1`, `format: 'md'`, mesma técnica de `compile-article-body.ts`) exercitado ponta a ponta — não-interferência, forma width-only inalterada, forma combinada produzindo o resultado de renderização exigido acima, e o mecanismo de renderização confirmado num Chromium real (incluindo o controle negativo citado acima, width/height nativos sozinhos) — ver `spikes/lexical-editorial/uxe-022-image-dimensions-production-pipeline-proof.mjs` e a Rastreabilidade (§11).

**Fechado quanto à gramática, aos três estados persistíveis e à garantia de renderização de cada um, acima. Requisitos de interação (pointer, teclado, foco, papéis/atributos ARIA do controle de resize, e a regra operacional de "pinar" o eixo não tocado) pertencem ao desenho de UI/UX da `UXE-022`, não a este contrato — este documento não normatiza UI.**

## 11. Rastreabilidade

Evidência deste gate vive em `spikes/lexical-editorial/` (commits `4ad1ce3`, `fa29763`, `93fa919`, `baff8ce`): `README.md` (narrativa completa UXE-001–UXE-004), `product-block-grammar.mjs` (gramática normativa, §3), `product-block-transformer.mjs` (Lexical, §4), `product-block-remark-plugin.mjs` (MDX/remark, §6–7), `product-block-real-projection.fixture.mjs` (dado real usado em §5), `compare-corpus.mjs`/`corpus/` (evidência do §2), `product-block-round-trip.mjs` (11/11, §3–4), `product-block-round-trip-full-cycle.mjs` (13/13, §5–7).

Evidência da extensão do §10 (persistência conjunta `width`/`height`, UXE-022) vive em: `packages/editorial/src/image/grammar.ts`/`grammar.spec.ts` (gramática normativa, incluindo `IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS`); `apps/admin/src/app/[siteSlug]/articles/article-body-image/node.ts`/`resize-zones.tsx`/`resize-sliders.tsx`/`transformer.ts` (transformer Lexical e UI de resize, Admin); `apps/admin/.../article-body-image/image-dimensions-remark-plugin.ts` e `apps/fastcompre/.../image-dimensions-remark-plugin.ts` (adapters remark/MDX dos dois pipelines públicos/preview); e `spikes/lexical-editorial/uxe-022-image-dimensions-production-pipeline-proof.mjs` (pipeline de produção real ponta a ponta — `@mdx-js/mdx` real, `remarkImageDimensions` real, `compileArticleBody` real — incluindo a garantia de renderização do estado (3) confirmada num Chromium real, com controle negativo).
