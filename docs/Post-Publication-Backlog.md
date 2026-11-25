# Post-Publication-Backlog.md — Commerce Platform / FastCompre

> Backlog de melhorias **pós-publicação**: ajustes identificados depois da primeira publicação real em produção (gate A6). Separado do `docs/Implementation-Backlog.md` (MVP, concluído) e do `docs/UX-Implementation-Backlog.md` (Etapa E, prefixos `UXF`/`UXA`/`UXE`/`UXW`/`UXQ`). Cada tarefa é tratada isoladamente, com um commit próprio, e segue o fluxo obrigatório do `CLAUDE.md` (investigação → aprovação → implementação → validação).

## Convenção de formato

Mesma convenção de campos do `docs/UX-Implementation-Backlog.md`: **Objetivo**, **Contexto/decisão relacionada**, **Pré-requisitos**, **Escopo incluído**, **Fora de escopo**, **Arquivos/áreas**, **Critérios de aceite**, **Testes esperados**, **Acessibilidade/responsividade** (quando aplicável), **Riscos**, **Status**.

## Prefixo de ID

| Prefixo | Área |
|---|---|
| `UXP` | Correções/melhorias de UI/UX pós-publicação, sem mudança de regra de negócio nem de contrato |
| `SEC` | Investigações/correções de segurança e de dependências identificadas após a publicação |
| `DEP` | Estabilidade e manutenção da resolução de dependências (lockfile), sem mudança funcional |

---

### UXP-001 — Corrigir card público de Produto/Ofertas em mobile

**Objetivo:** corrigir a apresentação do card público de Produto/Ofertas na página do Artigo do FastCompre, especialmente no mobile.

**Contexto/decisão relacionada:** observado no primeiro Artigo real publicado (2026-11-24), por medição em browser real contra produção:
- a imagem do Produto esticava até a altura do texto ao lado (96×420 px a 360 px; 96×504 px a 320 px; 96×192 px a 1280 px) e era recortada (`object-cover`). Causa: item de um `flex` com `align-items: stretch` padrão, sem altura própria;
- no mobile, nome, descrição e Ofertas ficavam espremidos numa coluna de 142–182 px ao lado da imagem fixa de 96 px;
- marketplace e preço formavam uma única frase com o mesmo peso dentro do CTA, com só 4 px entre as Ofertas.

O mesmo defeito existia no bloco inline `:::product` e na seção estática "Produtos". Decisões do PO: `h-24 w-24 self-start object-contain` na imagem; corrigir os dois consumidores; no mobile, imagem + nome na primeira linha e descrição/Ofertas em largura total abaixo; composição lateral em `sm`+; marketplace à esquerda e preço à direita com `tabular-nums`, `gap-2`, CTA full-width no mobile e de largura consistente no desktop. Refinamentos aprovados na mesma tarefa (o mobile acima ficou congelado depois do primeiro, com a imagem centralizada acima de nome/descrição/Ofertas): no desktop/tablet (`sm`+), composição lateral em toda a largura interna do card — imagem de 176×176 (`sm:h-44 sm:w-44`, `object-contain`, sem fundo) numa coluna de 11rem, centralizada nela na horizontal e na vertical; linha divisória vertical (`border-outline-subtle`) entre imagem e conteúdo; nome à esquerda e em negrito (`sm:font-semibold`); descrição em toda a largura da coluna de conteúdo; Ofertas lado a lado em colunas iguais (`repeat(auto-fill, minmax(15rem, 1fr))`), quebrando para a linha de baixo quando não cabem; marketplace à esquerda e preço à direita, sem traço visível (o " — " existe só em `sr-only`). `next/image` com `width`/`height` de 176 e `sizes="(min-width: 640px) 176px, 96px"`.

**Pré-requisitos:** gate A6 (primeira publicação real) — concluído.

**Escopo incluído:**
- layout do card (grid) nos dois consumidores, com classes compartilhadas num módulo local;
- imagem 96×96 fixa com `object-contain`;
- hierarquia marketplace/preço e CTA responsivo em `ProductOfferList`;
- testes unitários, regressão visual do card em 360 px e asserts programáticos de layout em `e2e-a11y/`.

**Fora de escopo:**
- lógica de "melhor Oferta" e ordenação por preço;
- truncar ou alterar a descrição do Produto;
- texto do CTA;
- contratos da API, `ArticleProduct`, regras editoriais, redirect `/r/` e tracking;
- avatar do Autor, página pública de Autor e dashboard de cliques.

**Arquivos/áreas:**
- `apps/fastcompre/src/app/[categorySlug]/[articleSlug]/`: `product-card-layout.ts` (novo), `product-block.tsx`, `page.tsx`, `product-offer-list.tsx`, `product-block.spec.tsx`, `page.spec.tsx`;
- `apps/fastcompre/e2e-visual/article.visual.spec.ts` e o baseline novo `article-product-card-360`;
- `apps/fastcompre/e2e-a11y/product-card-layout.spec.ts` (novo).

**Critérios de aceite:**
- imagem do Produto 96×96 no mobile e 176×176 em `sm`+, sem esticar nem recortar;
- a 320/360 px, imagem centralizada horizontalmente no card, com nome, descrição e Ofertas abaixo em largura total, sem overflow horizontal da página;
- em `sm`+, composição lateral em toda a largura do card, com linha divisória, nome em negrito à esquerda e Ofertas lado a lado em colunas iguais (quebrando para a linha de baixo); nenhum texto, marketplace ou preço centralizado;
- cada Oferta em estoque continua sendo um link próprio, na ordem recebida, com `href` via `affiliateRedirectHref(offer.id, articleId)`, `target="_blank"`, `rel="sponsored nofollow noopener noreferrer"` e indicação acessível de nova aba;
- nome acessível do CTA inalterado (`<Marketplace> — <preço> (abre em nova aba)`);
- Oferta fora de estoque continua como texto, nunca link;
- `alt=""` da imagem preservado;
- suíte existente verde sem enfraquecer asserções.

**Testes esperados:**
- unitários: estrutura marketplace/preço, `tabular-nums`, nome acessível exato, imagem e layout nos dois consumidores, axe;
- `test:a11y`: axe existente mais os asserts programáticos a 320/360/1440 px;
- `test:visual-baseline`: baseline novo do card a 360 px e regeneração deliberada do `article-populated` (1440 px) após aprovação visual do PO.

**Acessibilidade/responsividade:**
- validação manual por conta do PO: teclado/foco, zoom 200%/reflow, leitor de tela;
- axe é gate de regressão, não certificação WCAG.

**Riscos:**
- fotos de Produto não quadradas ficam com margem dentro do quadrado (`object-contain`, decisão aceita);
- o baseline `article-populated` (1440 px) muda por desenho e precisa de regeneração deliberada.

**Status:** implementada e aprovada visualmente pelo PO em 2026-11-24 (mobile e desktop/tablet, incluindo simulação com 3 e 4 Ofertas). Baselines `article-populated` (1440 px) e `article-product-card-360` regenerados deliberadamente após a aprovação; suíte visual verde. Sem commit.

---

### UXP-002 — Corrigir enquadramento do avatar do Autor no Artigo público

**Objetivo:** corrigir o avatar do Autor que aparecia cortado no byline do Artigo publicado do FastCompre.

**Contexto/decisão relacionada:** investigação concluída em 2026-11-24. O markup atual do byline está correto: círculo de 40×40, `object-cover` centralizado, `alt=""` e nome visível. A causa observada foi o asset: uma foto vertical de meio corpo (941×1672), que o recorte central reduz ao tronco. O PO decidiu não aplicar `object-top` nem outro posicionamento global pensado para uma fotografia específica, e manter 40×40 e o CSS atual.

**Status:** **substituída pela UXP-003** em 2026-11-24. O objetivo passou a ser um cropper no Admin, para que o avatar seja recortado já quadrado na origem. Nenhuma alteração de código foi feita no FastCompre. O avatar atual em produção ainda não foi substituído: isso depende de um novo upload pelo Admin com o cropper, que é uma ação de conteúdo.

---

### UXP-003 — Cropper de avatar do Autor no Admin

**Objetivo:** ao selecionar uma foto para o Autor, permitir escolher no navegador qual parte da imagem forma o avatar, gerando uma imagem quadrada final pelo fluxo de upload `AUTHOR_AVATAR` existente.

**Contexto/decisão relacionada:** substitui a UXP-002. Decisões do PO:
- crop 1:1 com prévia circular, arraste, toque, zoom de 1 a 3, setas do teclado e controles acessíveis;
- quatro botões de direção como alternativa de ponteiro único ao arraste (WCAG 2.2, 2.5.7);
- "Ajustar recorte" enquanto houver recorte não salvo, com o original só em memória;
- `accept` restrito a JPEG, PNG e WebP;
- limite de 5 MiB mantido também para o arquivo original;
- saída quadrada de até 512×512, sem ampliar;
- WebP preferido, com PNG aceito quando o canvas não codificar WebP;
- orientação visual correta comprovada em browser real;
- imagem tratada como avatar reutilizável do Autor.

`react-easy-crop` 6.2.5 (MIT) foi adicionado somente ao Admin, com versão exata.

**Pré-requisitos:** nenhum.

**Escopo incluído:**
- `AvatarCropDialog`: `<dialog>` modal nativo, foco inicial na área de recorte, foco preso no diálogo, `Escape` e retorno de foco;
- geração da imagem em canvas no cliente;
- integração em `AuthorForm`: selecionar abre o cropper; Cancelar ou `Escape` não alteram o formulário; "Aplicar recorte" gera um `File` local e marca o formulário como alterado; Salvar mantém o upload `AUTHOR_AVATAR` e a persistência existentes;
- validação client-side de tipo e tamanho, com a API como autoridade;
- testes Jest, testes em browser real e baselines visuais do diálogo.

**Fora de escopo:**
- API, Prisma, contratos e FastCompre;
- persistência de coordenadas de recorte;
- recortar novamente um avatar já persistido;
- ampliar o limite de entrada acima de 5 MiB;
- página pública de Autor, slug, links e SEO.

**Arquivos/áreas:**
- `apps/admin/src/app/[siteSlug]/authors/`: `avatar-crop-dialog.tsx` e `crop-avatar-image.ts` (novos, com specs), `author-form.tsx` e `author-form.spec.tsx`;
- `apps/admin/e2e-a11y/`: `author-avatar-crop-fixtures.ts`, `author-avatar-crop.a11y.spec.ts`, `author-avatar-crop-behavior.spec.ts` e `avatar-fixtures/`;
- `apps/admin/e2e-visual/author-avatar-crop.visual.spec.ts` e os baselines de 1440 e 360 px;
- `apps/admin/package.json` e `pnpm-lock.yaml`.

**Critérios de aceite:**
- fluxo preservado exatamente como descrito em "Escopo incluído";
- arquivo enviado é o recortado: quadrado, até 512×512, WebP (ou PNG de fallback);
- `avatarUrl` continua sendo só a URL final;
- orientação EXIF correta no resultado;
- teclado completo, sem dependência de arraste;
- 320 px sem overflow e alvos de toque ≥ 44 px;
- sem animação com `prefers-reduced-motion`;
- suíte existente verde sem enfraquecer asserções.

**Testes esperados e executados:**
- **Jest:**
  - `crop-avatar-image.spec.ts`: validação, tamanho de saída, limites de posição e geração com ambiente injetado;
  - `avatar-crop-dialog.spec.ts`: ARIA, foco, zoom, direção, restaurar, prévia, aplicar, processamento, cancelar/`Escape`, erro de carga e axe;
  - `author-form.spec.tsx`: fluxo integrado.
- **Browser real (`e2e-a11y`):**
  - axe em 1440 e 360 px;
  - fluxo só com teclado e foco preso no diálogo;
  - botões de direção e arraste com mouse;
  - saída que reflete a posição definida pelos botões, com prova negativa sem a correção;
  - WebP 512×512 enviado com `AUTHOR_AVATAR`;
  - EXIF `Orientation=6` com quadrantes conferidos e sem ampliação;
  - "Ajustar recorte" sobre o original;
  - 320 e 360 px, reflow a 640 px e movimento reduzido.
- **Visual:** diálogo em 1440 e 360 px.

**Acessibilidade/responsividade:**
- validação manual por conta do PO: leitor de tela, zoom real de 200% e aparelho de toque real;
- axe é gate de regressão, não certificação WCAG.

**Riscos:**
- imagens grandes (até 5 MiB) são decodificadas inteiras no navegador;
- o rótulo nativo do campo de arquivo ("Choose File / No file chosen") segue o idioma do navegador, como antes desta tarefa.

**Ajustes finais aprovados pelo PO (2026-11-25):**
- **Retomar enquadramento:**
  - a área do último recorte aplicado (pixels da imagem original) fica só em memória, junto do original, e é repassada ao cropper via `initialCroppedAreaPixels`;
  - a área é equivalente mesmo com o diálogo reaberto em outro tamanho;
  - cancelar um ajuste, ou selecionar outra imagem e cancelar, preserva o avatar, o original e a área;
  - "Restaurar enquadramento" continua voltando ao centro com zoom 1.
- **Cancelamento durante a geração:**
  - Cancelar e `Escape` ficam disponíveis durante a geração;
  - resultados e erros de gerações canceladas, ou de um diálogo desmontado, são descartados;
  - o formulário só aceita o resultado do cropper aberto no momento, então uma operação antiga não sobrescreve um recorte mais recente.
- **Preservado:** o reaproveitamento da URL quando o upload dá certo mas a persistência do Autor falha.
- **Testes:**
  - Jest: área repassada ao reabrir; troca de imagem com cancelamento; geração pendente com cancelamento e resolução ou rejeição tardia; desmontagem; operação antiga contra recorte novo. Com prova negativa sem as proteções;
  - browser real: equivalência do enquadramento reaberto em 420 px depois de aplicado em 1440 px, medida pela área em % e com zoom equivalente (±0,05) em vez de igualdade numérica exata. Com prova negativa sem a retomada.

**Status:** implementada em 2026-11-24, com ajustes finais em 2026-11-25; validação manual local do PO concluída. Sem commit.

---

### SEC-001 — Investigar sanitização de logs do SDK AWS/Smithy

**Objetivo:** verificar se o projeto está exposto à falha de ocultação de dados em logs do SDK AWS v3 que motivou a depreciação de `@smithy/core@3.31.1`, e definir a correção.

**Contexto/decisão relacionada:** identificado em 2026-11-25, durante a instalação do `react-easy-crop` na UXP-003, como aviso do pnpm. A dependência já estava no lockfile antes da UXP-003, que não a introduziu nem alterou. Nada foi investigado a fundo nem atualizado ainda (decisão do PO).

- **Pacote e versão:** `@smithy/core@3.31.1`, dependência transitiva de `@aws-sdk/client-s3@3.1106.0` e de vários pacotes `@aws-sdk/*` (`core`, `checksums`, `credential-provider-*`), usada **somente pela API** (`apps/api`). No npm, em 2026-11-25, a versão mais recente não depreciada era a 3.41.1.
- **Aviso de depreciação (npm):** "Deprecated due to a bug in custom logger data redaction. Upgrade to the latest version. If you used a custom logger with this version, review your logs and rotate any credentials or other secrets. See https://github.com/aws/aws-sdk-js-v3/issues/8393."
- **Uso atual observado:** o `S3Client` em `apps/api/src/modules/uploads/infrastructure/s3-storage.adapter.ts` (`buildS3Client`) é criado com `region`, `endpoint`, `forcePathStyle` e `credentials`, **sem `logger` customizado** no código lido.
- **O que NÃO está comprovado:** que o projeto esteja imune. Falta confirmar:
  - quais configurações e caminhos de log a issue considera afetados;
  - se algum logger chega ao SDK por outro meio (padrões do cliente, middleware, variáveis de ambiente, outras instâncias de cliente);
  - se os logs da API em produção (Railway) contêm algum dado do SDK.

**Pré-requisitos:** nenhum.

**Escopo incluído (quando iniciada):**
- ler a issue 8393 e o changelog da correção;
- inventariar todas as instâncias e configurações de clientes AWS no repositório;
- verificar, somente com leitura, os logs da API em produção;
- concluir sobre a exposição real, com evidências;
- propor a atualização de `@aws-sdk/client-s3` / `@smithy/core` como mudança própria e testada, com unit e e2e de upload da API;
- se houver exposição, avaliar a rotação das credenciais do R2.

**Fora de escopo:** qualquer atualização de dependência antes da conclusão da investigação e da aprovação do PO.

**Arquivos/áreas:** `apps/api` (cliente S3 e dependências), `pnpm-lock.yaml` e logs da API em produção.

**Critérios de aceite:** exposição real concluída com evidência (afetado / não afetado / inconclusivo), plano de correção aprovado e, se aplicável, a decisão sobre rotação de credenciais registrada.

**Riscos:**
- dados sensíveis (por exemplo, credenciais) em logs, se algum caminho de log do SDK estiver ativo;
- regressão do upload para o R2 ao atualizar o SDK.

**Conclusão da investigação (2026-11-25):** classificação **não afetado** pela falha da issue 8393, com base em evidência de código e com evidência complementar de logs. Não é garantia de ausência de exposição histórica por outros mecanismos.

- **Issue 8393** ("Custom loggers receive unredacted data when nested in lists & maps"; aberta; `bug`, `p1`, `released`):
  - versões afetadas: `@smithy/core` `>=3.24.0 <3.38.1` e `@smithy/smithy-client` `>=4.5.0 <4.13.0`;
  - correção: `@smithy/core` 3.38.1 ou superior;
  - a falha afeta só quem passa um `logger` customizado ao cliente AWS: valores sensíveis dentro de listas ou mapas chegam ao `logger.info` sem a ocultação esperada. Texto da issue: "does not apply if you did not configure a custom logger".
- **Evidências de código:**
  - único cliente AWS do repositório: `buildS3Client` (`apps/api/.../s3-storage.adapter.ts`), sem `logger`, `middlewareStack` ou `requestHandler` customizados, em todas as versões do histórico do git deste arquivo e de `uploads.module.ts`;
  - sem logger, o `@aws-sdk/client-s3@3.1106.0` usa `config?.logger ?? new NoOpLogger()`, e os métodos do `NoOpLogger` não fazem nada;
  - o `loggerMiddleware` (`@aws-sdk/core@3.977.6`) só chama `logger?.info`/`logger?.error` do cliente;
  - a única escrita direta do SDK no `console` é uma frase fixa, sem dados, só para corpos em stream (o adaptador envia `Buffer`);
  - comando usado: só `PutObjectCommand` (`Bucket`, `Key`, `Body`, `ContentType`);
  - `@smithy/smithy-client` não estava no lockfile.
- **Evidência de logs** (executada pelo PO, uma amostra de 618 linhas da API na Railway, só contagens):
  - 0 entradas no formato do logger AWS (`clientName`/`commandName`);
  - 0 menções a `PutObjectCommand`/`S3Client`;
  - 0 nomes de campos de credencial ou assinatura;
  - 0 avisos de streaming do SDK.
- **Rotação de credenciais:** não exigida pelo advisory, que a condiciona a logger customizado. Não foi realizada (decisão do PO).

**Implementação (2026-11-25), opção B (atualização transitiva mínima):**
- **Resultado:**
  - `@smithy/core` de 3.31.1 para **3.40.0** (versão escolhida pelo PO: já contém a correção e circula há mais tempo que a 3.41.1);
  - `@smithy/types` **4.20.0** adicionado só para o `@smithy/core`, que exige `^4.20.0`; os demais `@smithy/*` seguem na 4.16.1 (coexistência aceita, sem dedupe forçado);
  - `@aws-sdk/client-s3@3.1106.0` e `@aws-sdk/core@3.977.6` mantidos;
  - nenhum `package.json` alterado.
- **Método:**
  - o `pnpm update` isolado não atualiza dependência transitiva (`@smithy/core` permaneceu 3.31.1);
  - foi usado override **temporário** `@smithy/core: 3.40.0` no `pnpm-workspace.yaml`, seguido de `pnpm install`, remoção do override e novo `pnpm install`;
  - o resolvedor reintroduz alterações alheias a cada escrita do lockfile (ver DEP-001). Com exceção pontual autorizada pelo PO, só esses trechos alheios foram restaurados ao texto original;
  - versões, hashes e referências do Smithy são exatamente os gerados pelo resolvedor.
- **Validações:**
  - diff do lockfile restrito a `@smithy/core` e `@smithy/types`;
  - nenhuma versão afetada na árvore;
  - sem `overrides` no workspace ou no lockfile;
  - nenhuma política do pnpm alterada;
  - integridade igual à publicada no npm;
  - `pnpm install --frozen-lockfile` passou;
  - `pnpm why`: 1 versão de `@smithy/core` (3.40.0);
  - runtime da API: `@smithy/core` 3.40.0 por `client-s3` e por `@aws-sdk/core`;
  - instalação reproduzível em cópia limpa do repositório (sem `node_modules` prévio, `--ignore-scripts`);
  - API: unit 455/455 e e2e 668/668 (78 suítes);
  - `pnpm typecheck`, `pnpm lint` (0 erros), `pnpm build` e `git diff --check`: OK.
- **Validação real de storage (executada pelo PO em 2026-11-25):**
  - **Silo local:** upload pelo Admin usando o fluxo real da API (adaptador e SDK reais), aprovado;
  - **Cloudflare R2:** com `@smithy/core` 3.40.0 em uso, `PutObject`, `HeadObject`, `GET` público por `media.fastcompre.com`, integridade do conteúdo e `DeleteObject` OK. Objeto de teste sob `sdk-validation/`, removido ao final.
- **Pendentes:**
  - deploy da API com o lockfile atualizado;
  - após o deploy, upload real pelo Admin em produção e conferência dos logs da API.

**Status:** investigação concluída (não afetado); atualização implementada e validada no Silo local e no Cloudflare R2 em 2026-11-25; **aprovada para commit**. Deploy e validação em produção pendentes.

---

### DEP-001 — Estabilizar resolução das dependências transitivas do Lighthouse

**Objetivo:** eliminar a re-resolução não determinística de dependências transitivas do Lighthouse a cada escrita do `pnpm-lock.yaml`, para que atualizações pontuais de dependências produzam diffs só com o que foi autorizado.

**Contexto/decisão relacionada:** observado na UXP-003 e na SEC-001 (2026-11-24/25).
- **Origem:** `@paulirish/trace_engine@0.0.65`, dependência da `devDependency` raiz `lighthouse@13.4.1`, declara `third-party-web` e `legacy-javascript` com a tag **`latest`**, não com uma faixa de versão. O pnpm re-resolve tags em todo `pnpm install` ou `pnpm update` que reescreve o lockfile.
- **Alterações colaterais observadas:**
  - `legacy-javascript` de 0.0.1 para 0.0.4 e `third-party-web` de 0.29.2 para 0.30.0;
  - linhas `deprecated:` adicionadas a pacotes já existentes: `@opentelemetry/sdk-trace-base@2.10.0`, `argon2@0.45.1` e `node-abort-controller@3.1.1`.

  Nas duas tarefas, essas alterações foram restauradas ao original e não estão no lockfile versionado.
- **Possível impacto:** `third-party-web` (catálogo de domínios de terceiros) e `legacy-javascript` (detecção de polyfills ou JS legado) alimentam auditorias do Lighthouse usadas nas medições de performance. Versões que mudam sem decisão explícita podem alterar classificações e resultados entre execuções ou máquinas e afetar a comparação com os budgets de performance.

**Pré-requisitos:** nenhum.

**Escopo incluído (quando iniciada):**
- decidir entre fixar as duas dependências (override permanente, com aprovação), atualizar o `lighthouse`/`@paulirish/trace_engine` para versões sem tag `latest`, se existirem, ou aceitar e documentar a variação;
- validar que um `pnpm install` não congelado não altera mais o lockfile;
- reexecutar as medições de performance afetadas, se as versões mudarem.

**Fora de escopo:** atualizar `argon2`, `@opentelemetry/*` ou `node-abort-controller` (os avisos de depreciação desses pacotes exigem decisões próprias).

**Arquivos/áreas:** `package.json`/`pnpm-workspace.yaml` (raiz) e `pnpm-lock.yaml`.

**Critérios de aceite:** um `pnpm install` não congelado em árvore limpa não produz diff no lockfile; versões das ferramentas de medição documentadas.

**Riscos:** mudança de resultados de Lighthouse ao alterar as versões fixadas.

**Status:** registrada em 2026-11-25. Não iniciada.

---

### DEP-002 — Atualizar `argon2` para 0.45.2 (formato PHC dos hashes)

**Objetivo:** sair da versão depreciada `argon2@0.45.1` (dependência direta da API, hash de senhas).

**Contexto/decisão relacionada:** investigação concluída em 2026-11-25.
- **Causa:** o npm deprecia a 0.45.0 e a 0.45.1 ("bug in hash encoding and generates invalid hashes"). O defeito é só de formato: o `hash()` serializava os parâmetros como `m,p,t` em vez da ordem PHC `m,t,p` (issue #559 e correção no PR #562, commit `d6d22754`, em `argon2.cjs`: `{ m, p, t }` → `{ m, t, p }`).
- **Impacto:** digest e salt não mudam, e o `verify` da própria biblioteca lê os parâmetros por nome. Hashes existentes (do bootstrap de admin desde 2026-07-30 e o `dummy-password-hash.ts`) continuam válidos na 0.45.1 e na 0.45.2. Confirmado por teste empírico em memória com a versão instalada.
- **Classificação:** não afetado em autenticação e segurança. Risco residual só se outra implementação, mais rígida quanto à ordem, precisar verificar esses hashes (inferência, não testada); mitigável reordenando o texto, sem rotacionar senhas.
- **Decisão do PO:** atualização **adiada** (não urgente).

**Escopo (quando iniciada):**
- `argon2` para `^0.45.2`;
- testes unit e e2e de identidade e login, incluindo a verificação de hash no formato antigo;
- build da imagem Docker da Railway (módulo nativo);
- opcional: regenerar o hash fixo do `dummy-password-hash.ts` no formato `m,t,p`.

Sem reprocessar os hashes existentes.

**Status:** registrada em 2026-11-25. Adiada.

---

### UXP-004 — Redesign da página de login do Admin

**Objetivo:** dar ao login do Admin identidade **Commerce Platform** (o Admin é multi-site), com estilo SaaS premium, minimalista e corporativo, sem alterar a autenticação.

**Decisões do PO (2026-11-25):**
- **Opção A:** só tokens existentes, painel com `surface-inverse` (verde-escuro), sem alterar `packages/ui`.
- **Desktop (≥ `lg`, 1024 px):** painel institucional (48%) à esquerda e formulário (52%) à direita.
- **Mobile:** só a faixa superior com a marca, sem conteúdo institucional.
- **Painel:** ícone `Layers` com "Commerce Platform"; rótulo "GESTÃO EDITORIAL"; título "Sua operação editorial em um só lugar."; texto complementar; ilustração abstrata em SVG leve (documento e barras, sem dados); copyright.
- **Formulário:**
  - até 400 px, sem card;
  - "ACESSO ADMINISTRATIVO", H1 "Bem-vindo de volta" e subtítulo;
  - campos de 48 px com ícones `Mail`/`Lock` e controle `Eye`/`EyeOff`;
  - botão "Entrar" de 48 px com `ArrowRight`;
  - `ShieldCheck` com "Acesso restrito a usuários autorizados".
- **Controle de senha:** nome acessível dinâmico "Mostrar senha"/"Ocultar senha" com `aria-controls`, sem `aria-pressed`. A senha volta a ficar oculta a cada envio.
- **Validação:** foco no primeiro campo inválido.
- **Fora:** recuperação de senha, cadastro, "lembrar de mim" e login social.

**Implementação:**
- `apps/admin/src/app/login/`:
  - `page.tsx` (layout dos painéis; no DOM o `<main>` vem antes do `<aside>`, reposicionado por CSS `order`; o painel não tem elementos focáveis);
  - `login-form.tsx` (visual com tokens, controle de senha, `aria-busy` e `Loader2` com `motion-safe`, `name` nos campos para gerenciadores de senha);
  - `login-brand-panel.tsx` (novo, Server Component);
  - `login.module.css` reescrito só com variáveis semânticas (gradiente e grade decorativos), sem hex.
- **Preservado integralmente:** `loginRequestSchema`/`loginResponseSchema`, `POST /admin/auth/login` via `apiRequest` (`credentials: 'include'`, cookie `HttpOnly`), mensagens 401/429/genérica, `router.replace('/')` e `autoComplete` (`email`, `current-password`).
- **Fora da tarefa:** API, Prisma, contratos, FastCompre e `packages/ui` não alterados; nenhuma dependência nova.

**Testes:**
- **Jest:** 8 testes existentes mantidos; novos para o controle de senha, ocultar ao enviar, foco no primeiro campo inválido, `aria-busy`, a composição da página (`login-page.spec.tsx`: landmarks, textos aprovados, sem "FastCompre", painel sem focáveis, sem recursos de autenticação extras) e axe.
- **Browser real:** novo `e2e-a11y/login-presentation.spec.ts`:
  - 1440 px: proporção 48/52, formulário centralizado até 400 px e controles de 48 px;
  - contraste ≥ 4,5:1 dos textos do painel;
  - 360/320 px: faixa com a marca, sem institucional, formulário na primeira tela e sem overflow;
  - 640×360 (pouca altura/zoom);
  - ordem de teclado e foco visível;
  - indicador de envio sem animação com movimento reduzido.

  No `login.a11y.spec.ts` existente, o seletor do campo de senha passou a `getByLabel('Senha', { exact: true })`, porque o `getByLabel` do Playwright casa por trecho e "Mostrar senha" também conteria "senha". O alvo e as verificações são os mesmos.
- **Visual:** novos baselines `login-1440`, `login-360` e `login-error-1440` (copyright mascarado, porque o ano é calculado no build). Baselines anteriores preservados.

**Status:** implementada em 2026-11-25, aguardando aprovação visual do PO. Sem commit.
