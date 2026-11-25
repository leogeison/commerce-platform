# Post-Publication-Backlog.md — Commerce Platform / FastCompre

> Backlog de melhorias **pós-publicação**: ajustes identificados depois da primeira publicação real em produção (gate A6). Separado do `docs/Implementation-Backlog.md` (MVP, concluído) e do `docs/UX-Implementation-Backlog.md` (Etapa E, prefixos `UXF`/`UXA`/`UXE`/`UXW`/`UXQ`). Cada tarefa é tratada isoladamente, com um commit próprio, e segue o fluxo obrigatório do `CLAUDE.md` (investigação → aprovação → implementação → validação).

## Convenção de formato

Mesma convenção de campos do `docs/UX-Implementation-Backlog.md`: **Objetivo**, **Contexto/decisão relacionada**, **Pré-requisitos**, **Escopo incluído**, **Fora de escopo**, **Arquivos/áreas**, **Critérios de aceite**, **Testes esperados**, **Acessibilidade/responsividade** (quando aplicável), **Riscos**, **Status**.

## Prefixo de ID

| Prefixo | Área |
|---|---|
| `UXP` | Correções/melhorias de UI/UX pós-publicação, sem mudança de regra de negócio nem de contrato |
| `SEC` | Investigações/correções de segurança e de dependências identificadas após a publicação |

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

**Status:** registrada em 2026-11-25. Não iniciada.
