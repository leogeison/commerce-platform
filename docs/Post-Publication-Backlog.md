# Post-Publication-Backlog.md — Commerce Platform / FastCompre

> Backlog de melhorias **pós-publicação**: ajustes identificados depois da primeira publicação real em produção (gate A6). Separado do `docs/Implementation-Backlog.md` (MVP, concluído) e do `docs/UX-Implementation-Backlog.md` (Etapa E, prefixos `UXF`/`UXA`/`UXE`/`UXW`/`UXQ`). Cada tarefa é tratada isoladamente, com um commit próprio, e segue o fluxo obrigatório do `CLAUDE.md` (investigação → aprovação → implementação → validação).

## Convenção de formato

Mesma convenção de campos do `docs/UX-Implementation-Backlog.md`: **Objetivo**, **Contexto/decisão relacionada**, **Pré-requisitos**, **Escopo incluído**, **Fora de escopo**, **Arquivos/áreas**, **Critérios de aceite**, **Testes esperados**, **Acessibilidade/responsividade** (quando aplicável), **Riscos**, **Status**.

## Prefixo de ID

| Prefixo | Área |
|---|---|
| `UXP` | Correções/melhorias de UI/UX pós-publicação, sem mudança de regra de negócio nem de contrato |

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
