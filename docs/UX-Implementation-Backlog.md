# UX-Implementation-Backlog.md — Commerce Platform / FastCompre — Etapa E

> Documento oficial de backlog da Etapa E (UI/UX Implementation Backlog). Consolida a macroestrutura E0–E13 aprovada, incorporando os três ajustes finais (performance budget do FastCompre definido antes de E9/E10; golden screenshots nascendo por superfície ao longo das fases, não só em E13; UX-M06 com dependência explícita declarada de UX-M01–M05 + E13) e, nesta revisão, quatro refinamentos mecânicos adicionais: (1) o Mapa de dependências consolidado foi reconstruído para refletir fielmente o DAG real definido nos `Pré-requisitos` de cada tarefa, sem falsas sequências introduzidas por conveniência de visualização; (2) `UXQ-001` corrigido no mapa para não depender de `UXA-016`/`UXE-016`/`UXW-016` (o scaffold nasce após o primeiro fluxo real testável, `UXA-012` ou `UXW-006`); (3) `UXW-016` explicita que desvio de performance registrado não bloqueia `UX-M04`, mas bloqueia obrigatoriamente `UX-M05` até resolvido — o budget nunca é relaxado; (4) `UXA-001`/`UXA-005` explicitam que uma abstração provada em Categoria pode permanecer local ao fechar E2, sendo promovida a `packages/ui` só quando um segundo consumidor real (`UXA-013`/`UXA-015`) comprovar a reutilização. Nenhuma das 85 tarefas, IDs, escopos ou critérios foi reaberta além destes quatro pontos. Fontes normativas: `Architecture.md`, `Implementation-Backlog.md` (MVP) e as Etapas A, B, C e D (congeladas) deste ciclo de planejamento UI/UX. Este backlog trabalha **sobre** o MVP concluído — não o reconstrói, não altera Roles/tenancy/ciclo editorial/segurança/revalidação/tracking/contratos além do que foi explicitamente aprovado na Etapa D.

## Convenção de formato

Cada tarefa traz: **Objetivo**, **Contexto/decisão relacionada**, **Pré-requisitos**, **Escopo incluído**, **Fora de escopo**, **Arquivos/áreas**, **Critérios de aceite**, **Testes esperados**, **Acessibilidade/responsividade** (quando aplicável), **Performance** (quando aplicável), **Riscos**, **Dependências posteriores**. Tarefas de um mesmo bloco que compartilham pré-requisitos e riscos herdam o que já foi declarado no início do bloco, evitando repetição — mesma convenção do `Implementation-Backlog.md` original.

## Sistema de prefixos de ID

| Prefixo | Área | Fases cobertas |
|---|---|---|
| `UXF-` | **Foundation** — tokens, `packages/ui`, Tailwind cross-package, pré-requisitos de contrato/API, baseline e budget de performance | E0 + E1 |
| `UXA-` | **Admin** — infraestrutura de formulário/feedback validada em consumidor real, shell/navegação, CRUDs, Dashboard | E2 + E3 + E4 + E5 |
| `UXE-` | **Editorial** — spike e contrato de serialização, editor Lexical, pipeline MDX público correspondente | E6 + E7 + E8 |
| `UXW-` | **FastCompre (Web público)** — shell público, páginas públicas | E9 + E10 |
| `UXQ-` | **Quality** — acessibilidade camada 2, performance, QA final e regressão visual | E11 + E12 + E13 |

IDs não colidem com o backlog do MVP (`MONO-`, `DB-`, `CTR-`, `AUTH-`, `CAT-`, `EDT-`, `APP-`, `TRK-`, `UPL-`, `PUB-`, `WEB-`, `ADM-`, `REV-`, `QA-`) — este é um backlog novo e distinto, referenciando o anterior só como pré-condição de contexto, nunca reabrindo suas tarefas.

---

## UXF — Foundation (E0 + E1)

Bloco comum: nenhuma tarefa de UXF altera regra de negócio, Role, tenancy ou ciclo editorial — é infraestrutura técnica e um pequeno conjunto de capacidades de leitura pública aditivas, já aprovadas na Etapa D.

### UXF-001 — Fundação de tokens de design
**Objetivo:** consolidar cores (incluindo a validação WCAG 2.2 AA do verde-floresta em todos os estados de uso), tipografia (Geist Sans + Source Serif 4), espaçamento, radius, elevação e densidade como fonte única de verdade, consumível por `packages/ui` e por ambos os apps.
**Contexto/decisão relacionada:** Etapa B (congelada) — foundations/tokens; Etapa D — ownership de tokens sem cópia paralela por app.
**Pré-requisitos:** nenhum.
**Escopo incluído:** definição dos tokens em formato consumível (CSS custom properties ou equivalente Tailwind v4 `@theme`), incluindo variantes semanticamente dark-mode-ready (sem ativar dark mode).
**Fora de escopo:** ativação de dark mode; qualquer token específico de domínio (cor de status de Artigo, por exemplo, entra junto do componente que a usa, não aqui).
**Arquivos/áreas:** `packages/ui/` (novo).
**Critérios de aceite:** todos os pares de cor de texto/fundo definidos passam em contraste AA (4.5:1 texto normal, 3:1 texto grande/UI); tokens versionados e documentados; nenhum valor de cor/espaçamento hard-coded fora dos tokens nos componentes criados a partir daqui.
**Testes esperados:** teste automatizado de contraste dos pares definidos (script ou `jest` simples validando razão de contraste).
**Acessibilidade/responsividade:** contraste AA é o próprio critério de aceite desta tarefa.
**Performance:** nenhum impacto mensurável isoladamente.
**Riscos:** verde-floresta escolhido na Etapa B pode exigir mais de um tom (claro/escuro) para atingir AA em todos os usos — resolver aqui, não depois.
**Dependências posteriores:** UXF-002, UXF-005, todo componente visual do ciclo.

### UXF-002 — Esqueleto de `packages/ui`
**Objetivo:** criar o package no workspace pnpm, com fronteira documentada (primitives/tokens genéricos; nunca componente de domínio) conforme Etapa D.
**Contexto/decisão relacionada:** Etapa D, Seção 3 — fronteira rígida de `packages/ui`.
**Pré-requisitos:** UXF-001.
**Escopo incluído:** `package.json`, `tsconfig.json`, `src/index.ts`, README interno declarando a regra de fronteira ("funcionaria num app sem nenhum conceito deste domínio?").
**Fora de escopo:** qualquer componente real (entra em UXF-005 e just-in-time nas fases consumidoras).
**Arquivos/áreas:** `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/index.ts`.
**Critérios de aceite:** os dois apps declaram `packages/ui` como dependência de workspace e importam sem erro um export vazio de prova.
**Testes esperados:** nenhum automatizado — build/import é o próprio teste.
**Riscos:** nenhum.
**Dependências posteriores:** UXF-003, UXF-004, UXF-005.

### UXF-003 — Tailwind v4 no Admin
**Objetivo:** trazer o Admin (hoje em CSS Modules) para Tailwind v4, alinhado ao FastCompre.
**Contexto/decisão relacionada:** Etapa B — unificação Tailwind v4; execução, não nova decisão.
**Pré-requisitos:** UXF-002.
**Escopo incluído:** configuração do Tailwind v4 no Admin (`postcss.config`, entrypoint CSS); nenhuma tela migrada ainda.
**Fora de escopo:** remoção dos CSS Modules existentes (migração incremental, ocorre por tela nas fases consumidoras).
**Arquivos/áreas:** `apps/admin/postcss.config.mjs` (novo), `apps/admin/src/app/globals.css` ou equivalente.
**Critérios de aceite:** `pnpm --filter admin build` funciona com Tailwind ativo, coexistindo com CSS Modules existentes sem conflito.
**Testes esperados:** build verde no CI.
**Riscos:** conflito de especificidade entre Tailwind e CSS Modules existentes durante a coexistência — mitigar isolando por componente migrado.
**Dependências posteriores:** UXF-004, UXA-004 em diante.

### UXF-004 — Tailwind v4 consumindo `packages/ui` nos dois apps
**Objetivo:** provar, com um componente real, que o content-scanning do Tailwind de cada app alcança corretamente as classes usadas dentro de `packages/ui`, sem drift de tokens/CSS entre Admin e FastCompre.
**Contexto/decisão relacionada:** Etapa D, Seção 3 — "a configuração deve impedir, por construção, a divergência de tokens/CSS entre os dois apps".
**Pré-requisitos:** UXF-003, UXF-002.
**Escopo incluído:** configuração de `content`/scanner do Tailwind de Admin e FastCompre apontando para `packages/ui`; validação visual manual de um componente de prova renderizado nos dois apps.
**Fora de escopo:** qualquer primitive além do necessário para a prova.
**Arquivos/áreas:** `apps/admin/tailwind` (config), `apps/fastcompre/tailwind` (config).
**Critérios de aceite:** o mesmo componente de `packages/ui`, renderizado em Admin e em FastCompre, produz classes CSS idênticas geradas (sem classe ausente em nenhum dos dois builds).
**Testes esperados:** verificação automatizada simples (build + inspeção do CSS gerado) confirmando presença das classes esperadas nos dois bundles.
**Riscos:** este é o risco técnico mais concreto identificado na Etapa D para `packages/ui` — se a estratégia de scanning falhar silenciosamente, drift visual só apareceria depois, em produção.
**Dependências posteriores:** UXF-005 e todo o restante do ciclo.

### UXF-005 — Primitives mínimos de prova
**Objetivo:** entregar o menor conjunto de primitives que comprova o design system funcionando ponta a ponta — um componente de tipografia/texto, um de ação (Button) e um de estado (Skeleton ou Badge) — usando os tokens de UXF-001.
**Contexto/decisão relacionada:** ajuste do usuário — "E0 entrega... o conjunto mínimo de primitives necessário para provar o design system. Componentes adicionais entram just-in-time."
**Pré-requisitos:** UXF-001, UXF-002, UXF-004.
**Escopo incluído:** os três componentes citados, com estados de interação (hover/focus/disabled) e variantes mínimas necessárias para o primeiro consumidor real (Categoria, em UXA).
**Fora de escopo:** Dialog, Toast, Table, Dropdown, Tooltip, Select e qualquer outro primitive — entram just-in-time na fase que primeiro precisar deles.
**Arquivos/áreas:** `packages/ui/src/components/`.
**Critérios de aceite:** os três componentes renderizam corretamente nos dois apps; foco visível e navegável por teclado; nenhuma cor fora dos tokens.
**Testes esperados:** `jest-axe` (ver UXF-007) sobre os três componentes; teste de interação básica com Testing Library.
**Acessibilidade/responsividade:** foco visível (WCAG 2.4.7), alvo de toque mínimo 24×24 CSS px (meta 44×44 onde aplicável), contraste herdado de UXF-001.
**Riscos:** nenhum além do já registrado em UXF-004.
**Dependências posteriores:** UXA-001 em diante (primeiro consumidor real).

### UXF-006 — Ícones Lucide em `packages/ui`
**Objetivo:** disponibilizar Lucide como dependência resolvida do design system, sem uso ainda fora da prova.
**Contexto/decisão relacionada:** Etapa B — Lucide como biblioteca de ícones decidida.
**Pré-requisitos:** UXF-002.
**Escopo incluído:** instalação, re-export (se necessário) de um subconjunto inicial usado pelos primitives de UXF-005.
**Fora de escopo:** catálogo completo de ícones do produto.
**Arquivos/áreas:** `packages/ui/package.json`.
**Critérios de aceite:** ícone renderiza com `aria-hidden` correto quando decorativo, ou nome acessível quando funcional (ex.: botão só-ícone).
**Testes esperados:** coberto junto dos testes de UXF-005/UXF-007.
**Acessibilidade/responsividade:** ícone funcional sem texto visível sempre acompanhado de nome acessível.
**Riscos:** nenhum.
**Dependências posteriores:** todo componente visual subsequente.

### UXF-007 — Gate de acessibilidade automatizada, camada 1
**Objetivo:** ativar `jest-axe` + Testing Library como gate de CI, aplicado desde já aos primitives de UXF-005.
**Contexto/decisão relacionada:** Etapa D, Seção 4 — camada 1 (regressão de componente).
**Pré-requisitos:** UXF-005.
**Escopo incluído:** configuração de `jest-axe` no Admin (que já tem `jsdom`) e no FastCompre (após UXF-008); wiring no CI como passo obrigatório, não opcional.
**Fora de escopo:** Playwright/axe em browser real (UXQ-001) e checklist manual (UXQ-004/005) — ver Etapa D, declaração normativa: axe não é certificação de WCAG.
**Arquivos/áreas:** `apps/admin/jest.config.ts`, `apps/fastcompre/jest.config.ts`, `.github/workflows/ci.yml`.
**Critérios de aceite:** violação introduzida deliberadamente num componente de teste é capturada e falha o build; suíte real passa limpa.
**Testes esperados:** os próprios testes de `jest-axe` sobre UXF-005.
**Riscos:** nenhum.
**Dependências posteriores:** todo componente novo de `packages/ui` a partir daqui inclui teste `jest-axe` como parte do próprio critério de aceite.

### UXF-008 — `jsdom` + Testing Library no FastCompre
**Objetivo:** adicionar capacidade de teste de componente interativo ao FastCompre, hoje limitado a `testEnvironment: 'node'` + `renderToStaticMarkup`.
**Contexto/decisão relacionada:** Etapa D, Seção 6 — gap identificado e decisão evidence-based de adicionar `jsdom`+RTL como superset, sem quebrar specs existentes.
**Pré-requisitos:** nenhum (paralelo a UXF-001–007).
**Escopo incluído:** `jest-environment-jsdom`, `@testing-library/react`, `@testing-library/user-event` como devDependencies; ajuste de config preservando os specs `node`/`renderToStaticMarkup` existentes intactos.
**Fora de escopo:** reescrever specs existentes.
**Arquivos/áreas:** `apps/fastcompre/jest.config.ts`, `apps/fastcompre/package.json`.
**Critérios de aceite:** os 10 specs existentes do FastCompre continuam verdes sem alteração; um componente de prova interativo (ex.: um botão com `onClick`) é testável com `fireEvent`/`user-event`.
**Testes esperados:** suíte existente + um spec novo de prova.
**Riscos:** nenhum — ambiente superconjunto do atual, conforme já validado na investigação da Etapa D.
**Dependências posteriores:** UXF-007 (FastCompre), UXW-004 (drawer mobile), UXW-005.

### UXF-009 — Gate de fechamento UXF: build/consumo comprovado
**Objetivo:** marco de fechamento da fundação — os dois apps consumindo `packages/ui`, Tailwind sem drift, `jest-axe` ativo, FastCompre com `jsdom`.
**Contexto/decisão relacionada:** fecha E0.
**Pré-requisitos:** UXF-001 a UXF-008.
**Escopo incluído:** execução e registro do pipeline completo (build/lint/typecheck/test) dos dois apps + `packages/ui`; prova visual manual lado a lado do componente de UXF-004/005.
**Fora de escopo:** qualquer tela real do produto.
**Arquivos/áreas:** nenhum novo — verificação.
**Critérios de aceite:** pipeline completo verde; registro da prova visual anexado.
**Testes esperados:** o próprio pipeline.
**Riscos:** nenhum.
**Dependências posteriores:** todas as tarefas UXA/UXW subsequentes.

### UXF-010 — Endpoint público de listagem de Categorias
**Objetivo:** implementar o pré-requisito técnico aprovado na Etapa D.
**Contexto/decisão relacionada:** Etapa D, Seção 5 — `GET /public/sites/:siteSlug/categories`, reaproveitando `publicCategorySchema` + `paginatedResponseSchema`, ordenação alfabética por `name`, sem nova coluna de schema.
**Pré-requisitos:** nenhum (paralelo a UXF-001–009).
**Escopo incluído:** contrato (reaproveitado), controller, novo método de repositório (`findManyBySite` público filtrando `archivedAt: null`), teste unitário e e2e.
**Fora de escopo:** ordenação de curadoria (explicitamente não decidida agora, conforme Etapa D).
**Arquivos/áreas:** `packages/contracts/src/public/categories/`, módulo `catalog` da API (`presentation`/`infrastructure`).
**Critérios de aceite:** endpoint retorna Categorias não-arquivadas do Site, paginado, ordenado por `name` asc; Categoria de outro Site nunca aparece (isolamento multi-tenant preservado).
**Testes esperados:** unit (repositório/use case), e2e (incluindo teste de isolamento multi-tenant, mesmo padrão de `multi-tenant-isolation.e2e-spec.ts`).
**Riscos:** nenhum além do já mapeado na Etapa D.
**Dependências posteriores:** UXW-003 (menu de Categorias).

### UXF-011 — Autoria mínima no detalhe público do Artigo
**Objetivo:** implementar o segundo pré-requisito técnico aprovado.
**Contexto/decisão relacionada:** Etapa D, Seção 5 — `include: { author: true }` em `findOnePublishedBySite`, extensão de `publicArticleSchema` com `{ name, avatarUrl }`, `bio` explicitamente fora do contrato neste ciclo.
**Pré-requisitos:** nenhum (paralelo).
**Escopo incluído:** alteração do include na consulta existente, extensão aditiva do contrato, teste unitário e e2e.
**Fora de escopo:** `bio`; página dedicada de Autor público.
**Arquivos/áreas:** `packages/contracts/src/public/articles/public-article.ts`, `apps/api/.../prisma-article.repository.ts`, presenter público de Artigo.
**Critérios de aceite:** detalhe público do Artigo passa a incluir `author: { name, avatarUrl } | null`; Artigo sem Autor vinculado retorna `null`, nunca erro.
**Testes esperados:** unit + e2e cobrindo Artigo com e sem Autor vinculado.
**Riscos:** nenhum.
**Dependências posteriores:** UXW-010 (byline).

### UXF-012 — `orderBy` parametrizável em `findManyBySite`
**Objetivo:** terceiro pré-requisito técnico aprovado, suportando `updatedAt desc` para o Dashboard.
**Contexto/decisão relacionada:** Etapa D, Seção 5 — mudança de assinatura interna, sem contrato público alterado, default preservando `createdAt desc` atual.
**Pré-requisitos:** nenhum (paralelo).
**Escopo incluído:** parâmetro opcional de ordenação em `FindManyBySiteInput`/`findManyBySite`; uso existente (`ArticleList`) sem alteração de comportamento por omissão do parâmetro.
**Fora de escopo:** novo índice de banco (sort não-indexado aceitável na escala atual, conforme já registrado).
**Arquivos/áreas:** `apps/api/.../prisma-article.repository.ts`, use case de listagem administrativa.
**Critérios de aceite:** chamada sem o parâmetro novo se comporta exatamente como hoje; chamada com `updatedAt desc` retorna a ordem esperada.
**Testes esperados:** unit cobrindo os dois casos (default preservado; novo parâmetro).
**Riscos:** nenhum.
**Dependências posteriores:** UXA-017 (Dashboard).

### UXF-013 — Baseline mensurável de performance do FastCompre (estado atual)
**Objetivo:** medir Core Web Vitals (LCP, CLS, INP, TTFB) das 3 páginas públicas existentes, no estado atual, antes de qualquer mudança visual.
**Contexto/decisão relacionada:** regra nova desta rodada — "o performance budget do FastCompre deve ser definido antes da implementação de E9/E10, a partir de baseline mensurável do estado atual."
**Pré-requisitos:** nenhum (paralelo).
**Escopo incluído:** medição em ambiente próximo de produção (build de produção real, não `next dev`) das 3 rotas existentes (`/`, `/[categorySlug]`, `/[categorySlug]/[articleSlug]`), usando Lighthouse ou ferramenta equivalente.
**Fora de escopo:** qualquer otimização — esta tarefa só mede.
**Arquivos/áreas:** nenhum arquivo de produto — script/relatório de medição.
**Critérios de aceite:** relatório com os quatro valores por rota, reproduzível (script versionado, não medição manual avulsa).
**Testes esperados:** nenhum automatizado — é o próprio instrumento de medição.
**Performance:** esta tarefa **é** a instrumentação de performance do ciclo.
**Riscos:** ambiente de medição precisa ser consistente entre esta baseline e a medição final (UXQ-007), ou a comparação perde validade.
**Dependências posteriores:** UXF-014.

### UXF-014 — Definição do performance budget do FastCompre
**Objetivo:** fixar o budget de LCP/CLS/INP/TTFB por tipo de página (Home/Categoria/Artigo), a partir da baseline de UXF-013.
**Contexto/decisão relacionada:** regra nova desta rodada — budget definido antes de E9/E10; E12/UXQ continua sendo consolidação/verificação final, não a primeira definição.
**Pré-requisitos:** UXF-013.
**Escopo incluído:** budget documentado (valores-alvo, não só "manter o atual") coerente com Core Web Vitals do Google (Architecture.md, Seção 9 — requisito não-funcional já existente); critério explícito de regressão aceitável vs. inaceitável frente à baseline.
**Fora de escopo:** qualquer implementação.
**Arquivos/áreas:** documento de budget (mesmo local do relatório de UXF-013).
**Critérios de aceite:** budget aprovado, numérico, por página, referenciável por UXW-007 a UXW-016 e por UXQ-007.
**Testes esperados:** nenhum automatizado — é insumo normativo para as tarefas seguintes.
**Riscos:** budget otimista demais frente à baseline pode se provar inatingível só depois de UXW/E10 implementado — se isso ocorrer, é uma contradição real a trazer para aprovação, não a resolver silenciosamente relaxando o budget.
**Dependências posteriores:** toda tarefa UXW-007 a UXW-016; UXQ-007.

---

## UXA — Admin (E2 + E3 + E4 + E5)

Bloco comum: nenhuma tarefa desta seção altera Role, máquina de estados do Artigo ou autorização — só a superfície visual/interativa sobre as capacidades já existentes. Toda tarefa que produz um componente novo aplica o critério de fronteira de `packages/ui` (UXF-002) antes de decidir se o componente é extraído para o pacote ou fica local ao Admin.

### UXA-001 — Padrão de estado assíncrono, provado em Categoria
**Objetivo:** extrair um padrão compartilhado de `Loading`/`Error`/`Empty` a partir da necessidade real observada na tela de Categoria (hoje repetida manualmente em cada componente, ex.: `article-products-section.tsx`).
**Contexto/decisão relacionada:** ajuste do usuário — infraestrutura compartilhada nasce de necessidade real, validada em pelo menos um consumidor, não construída especulativamente.
**Pré-requisitos:** UXF-009.
**Escopo incluído:** componente(s) de estado implementados e usados na lista e no detalhe de Categoria — **local ao Admin por padrão**; a extração para `packages/ui` não é parte do escopo desta tarefa nem uma condição para considerá-la concluída.
**Fora de escopo:** aplicar a outras telas (entra em UXA-013/015 reaproveitando o padrão já provado); promoção para `packages/ui` (só ocorre, como tarefa própria, quando UXA-013 comprovar reutilização real sem alteração estrutural — ver UXA-005).
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/categories/` (implementação local); `packages/ui/src/components/` só é tocado se e quando a promoção ocorrer.
**Critérios de aceite:** os três estados renderizam corretamente na tela de Categoria; mensagem de erro distingue erro de negócio (ex.: 409) de erro genérico, mesmo critério já usado em `article-products-section.tsx`.
**Testes esperados:** Testing Library cobrindo os três estados + `jest-axe`.
**Acessibilidade/responsividade:** estado de erro anunciado via `role="alert"`; estado de loading não bloqueia navegação por teclado.
**Riscos:** extrair cedo demais para `packages/ui` sem um segundo consumidor real repetiria o erro que a Etapa D pediu para evitar — por isso a extração deliberadamente não faz parte desta tarefa, mesmo que tecnicamente simples de fazer agora.
**Dependências posteriores:** UXA-013, UXA-015, UXW-014.

### UXA-002 — Padrão de formulário, provado em Categoria
**Objetivo:** aplicar `react-hook-form` + `zodResolver` sobre o schema de `packages/contracts` já existente para Categoria, eliminando validação duplicada entre cliente e servidor.
**Contexto/decisão relacionada:** Etapa D, Seção 6 — decisão evidence-based já aprovada.
**Pré-requisitos:** UXF-009.
**Escopo incluído:** formulário de criação/edição de Categoria usando o schema Zod existente diretamente como resolver.
**Fora de escopo:** os demais formulários do Admin.
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/categories/`.
**Critérios de aceite:** validação client-side reflete exatamente as mesmas regras do contrato; submissão inválida nunca chega à API.
**Testes esperados:** Testing Library cobrindo submissão válida/inválida.
**Acessibilidade/responsividade:** erros de campo associados via `aria-describedby`; foco movido para o primeiro campo com erro na submissão falha.
**Riscos:** nenhum.
**Dependências posteriores:** UXA-013, UXA-015.

### UXA-003 — Dirty-state guard, provado em Categoria
**Objetivo:** implementar o guard de "alterações não salvas" para formulários CRUD comuns (explicit save + dirty-state guard), distinto do autosave/pending-save guard do editor.
**Contexto/decisão relacionada:** Etapa C — regra transversal de dirty-state; Etapa D — mecanismo diferente do pending-save guard do editor.
**Pré-requisitos:** UXA-002.
**Escopo incluído:** aviso de navegação com alterações não salvas no formulário de Categoria.
**Fora de escopo:** o pending-save guard do editor (UXE-008, mecanismo diferente por decisão já congelada).
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/categories/`.
**Critérios de aceite:** tentar sair da tela com alterações não salvas dispara confirmação; salvar com sucesso limpa o estado sujo.
**Testes esperados:** Testing Library simulando navegação com formulário sujo.
**Acessibilidade/responsividade:** confirmação de saída é um diálogo focável e navegável por teclado, não um `confirm()` nativo bloqueante sem foco gerenciado.
**Riscos:** nenhum.
**Dependências posteriores:** UXA-013, UXA-015.

### UXA-004 — Toast de feedback de sucesso, provado em Categoria
**Objetivo:** padrão compartilhado de notificação transitória de sucesso (ex.: "Categoria salva").
**Contexto/decisão relacionada:** vocabulário de estados globais congelado na Etapa C.
**Pré-requisitos:** UXA-002.
**Escopo incluído:** componente de Toast usado na submissão bem-sucedida do formulário de Categoria.
**Fora de escopo:** notificações persistentes/centro de notificação (não existe requisito para isso).
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/categories/`, possível `packages/ui`.
**Critérios de aceite:** toast aparece, é anunciado por leitor de tela (`aria-live="polite"`), some automaticamente sem exigir ação do usuário para conteúdo não crítico.
**Testes esperados:** Testing Library + `jest-axe`.
**Acessibilidade/responsividade:** `aria-live`; não depende de cor isoladamente para indicar sucesso (ícone + texto).
**Riscos:** nenhum.
**Dependências posteriores:** UXA-013, UXA-015, UXE-008 (feedback de autosave reaproveita o mesmo componente visual, mecanismo de disparo diferente).

### UXA-005 — Gate de fechamento: CRUD de Categoria totalmente migrado
**Objetivo:** fechar a prova de conceito da infraestrutura compartilhada — Categoria 100% no novo padrão (Tailwind, estados, formulário, dirty-state, toast), pronta para ser o modelo replicado em UXA-013/015.
**Contexto/decisão relacionada:** fecha E2. Ajuste desta rodada — o gate explicitamente **não exige** promoção de nenhuma abstração para `packages/ui` como condição de fechamento.
**Pré-requisitos:** UXA-001 a UXA-004.
**Escopo incluído:** revisão cruzada de acessibilidade/responsividade da tela de Categoria completa; remoção do CSS Module antigo da Categoria; decisão explícita, registrada nesta tarefa, sobre se cada padrão de UXA-001/002/003/004 permanece local ao Admin ou é promovido — **manter local é uma saída de fechamento válida e, na ausência de um segundo consumidor comprovado, a arquiteturalmente correta**, coerente com o princípio "nada de abstração especulativa" já registrado em `Architecture.md`, Seção 7.
**Fora de escopo:** as demais telas; promoção antecipada de qualquer padrão sem evidência de reuso.
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/categories/`.
**Critérios de aceite:** tela de Categoria (lista+form) 100% Tailwind v4, sem CSS Module residual; todos os specs verdes; `jest-axe` limpo; para cada um dos quatro padrões (estado assíncrono, formulário, dirty-state, toast), registro explícito de "local" ou "promovido", sem exigir que nenhum esteja promovido.
**Testes esperados:** suíte completa da tela de Categoria.
**Acessibilidade/responsividade:** alvo de toque, contraste, foco e responsividade (mobile/desktop) verificados nesta tela como referência para as demais.
**Riscos:** promover cedo demais é o risco já registrado em cada tarefa de UXA-001/002/003/004; o risco simétrico — não promover quando UXA-013 efetivamente comprovar reuso idêntico — é tratado em UXA-013, não aqui.
**Dependências posteriores:** UXA-013, UXA-015 (é nesse ponto, não aqui, que a promoção real se decide, tarefa a tarefa, conforme o achado de UXA-013).

### UXA-006 — Sidebar de navegação primária
**Objetivo:** implementar a navegação hierárquica Dashboard→Artigos→Produtos→Categorias→Autores.
**Contexto/decisão relacionada:** Etapa C — nav híbrida (sidebar primária); Etapa A — arquitetura de informação do Admin.
**Pré-requisitos:** UXF-009, UXA-005.
**Escopo incluído:** sidebar com os 5 itens, estado ativo/atual, respeitando visibilidade por Role já existente (`role-hierarchy.ts`).
**Fora de escopo:** topbar (UXA-007), Command Palette (UXA-009/010).
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/` (layout), novo componente de navegação.
**Critérios de aceite:** os 5 itens navegam corretamente; item ativo indicado visualmente e via `aria-current`.
**Testes esperados:** Testing Library de navegação + `jest-axe`.
**Acessibilidade/responsividade:** navegação por teclado completa; landmark `<nav>` com `aria-label`.
**Riscos:** nenhum.
**Dependências posteriores:** UXA-007, UXA-008, UXA-009.

### UXA-007 — Topbar de contexto global
**Objetivo:** seletor de site, trigger do Command Palette e menu de usuário.
**Contexto/decisão relacionada:** Etapa C — topbar como camada de contexto/utilidade, sem duplicar navegação da sidebar.
**Pré-requisitos:** UXA-006.
**Escopo incluído:** os três elementos citados, reaproveitando a lógica de troca de site já existente (`ADM-003`/`ADM-004` do backlog MVP).
**Fora de escopo:** a lógica de autorização de troca de site (já existe e não é alterada).
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/` (layout).
**Critérios de aceite:** troca de site funciona exatamente como hoje; trigger do Command Palette visível e operável por teclado (atalho + clique).
**Testes esperados:** Testing Library + `jest-axe`.
**Acessibilidade/responsividade:** menu de usuário como `<button aria-haspopup="menu">` com gestão de foco correta ao abrir/fechar.
**Riscos:** nenhum.
**Dependências posteriores:** UXA-009.

### UXA-008 — Adaptação responsiva do shell
**Objetivo:** sidebar retrátil/drawer em viewports estreitos, sem duplicar a navegação.
**Contexto/decisão relacionada:** Etapa C — adaptação acessível para viewports estreitos, exigida explicitamente.
**Pré-requisitos:** UXA-006, UXA-007.
**Escopo incluído:** breakpoint de colapso, controle de abrir/fechar acessível, foco preso (focus trap) quando aberto sobre o conteúdo.
**Fora de escopo:** nenhum.
**Arquivos/áreas:** mesmo componente de navegação de UXA-006.
**Critérios de aceite:** em viewport estreito, sidebar não ocupa espaço permanente; abre/fecha por toque e teclado; foco não escapa para o conteúdo por trás quando aberta.
**Testes esperados:** Testing Library simulando viewport estreito + `jest-axe`.
**Acessibilidade/responsividade:** este é o próprio critério de aceite da tarefa.
**Riscos:** nenhum.
**Dependências posteriores:** UXA-012.

### UXA-009 — Command Palette: escopo de Navegação
**Objetivo:** abrir a paleta e navegar para qualquer uma das 5 seções principais.
**Contexto/decisão relacionada:** Etapa C, refinamento aprovado — escopo garantido v1 = Navegação + Criação; "pular para registro específico" é capacidade opcional a validar em Etapa D (não validada — permanece opcional/fora deste ciclo).
**Pré-requisitos:** UXA-007.
**Escopo incluído:** atalho de teclado global, busca fuzzy simples sobre os 5 itens de navegação, fechamento por `Esc`.
**Fora de escopo:** busca por registros individuais (Categoria/Produto/Autor específico) — explicitamente não incluída neste ciclo.
**Arquivos/áreas:** novo componente `command-palette` em `apps/admin/src/`.
**Critérios de aceite:** abre pelo atalho e pelo trigger da topbar; navega corretamente; fecha com `Esc` devolvendo foco ao elemento que a abriu.
**Testes esperados:** Testing Library + `jest-axe`.
**Acessibilidade/responsividade:** padrão de combobox/listbox acessível (`role="dialog"`, gestão de foco, `aria-activedescendant` ou equivalente).
**Riscos:** nenhum.
**Dependências posteriores:** UXA-010.

### UXA-010 — Command Palette: escopo de Criação
**Objetivo:** atalhos para criar novo Artigo/Produto/Categoria/Autor diretamente da paleta, respeitando Role.
**Contexto/decisão relacionada:** mesmo escopo v1 da Etapa C.
**Pré-requisitos:** UXA-009.
**Escopo incluído:** itens de criação condicionados à Role mínima já exigida por cada rota `/new` existente.
**Fora de escopo:** criação inline sem navegar para a tela `/new` (não há requisito para isso).
**Arquivos/áreas:** mesmo componente de UXA-009.
**Critérios de aceite:** usuário sem Role suficiente não vê o atalho de criação correspondente, mesmo critério de autorização-como-UX já usado no restante do Admin (API continua sendo a autoridade real).
**Testes esperados:** Testing Library cobrindo os 4 Roles × visibilidade dos atalhos.
**Acessibilidade/responsividade:** herda de UXA-009.
**Riscos:** nenhum.
**Dependências posteriores:** UXA-012.

### UXA-011 — Skip links, landmarks e foco do shell
**Objetivo:** estrutura de acessibilidade do shell inteiro (não de uma tela específica).
**Contexto/decisão relacionada:** Etapa C — skip links e landmarks completos exigidos, hoje ausentes/parciais no Admin.
**Pré-requisitos:** UXA-006, UXA-007, UXA-008.
**Escopo incluído:** skip link "pular para o conteúdo principal", landmarks `<nav>`/`<main>`/`<header>` corretos, ordem de tabulação lógica.
**Fora de escopo:** conteúdo interno de cada tela (critério próprio de cada tarefa).
**Arquivos/áreas:** layout raiz do Admin autenticado.
**Critérios de aceite:** skip link funcional e visível ao focar; landmarks únicos e corretamente nomeados; navegação por teclado sem armadilhas de foco em nenhuma combinação sidebar/topbar/palette.
**Testes esperados:** `jest-axe` sobre o layout completo + verificação manual de tabulação.
**Acessibilidade/responsividade:** este é o próprio critério de aceite.
**Riscos:** nenhum.
**Dependências posteriores:** UXA-012.

### UXA-012 — Gate de fechamento: shell do Admin
**Objetivo:** marco de fechamento da navegação nova do Admin.
**Contexto/decisão relacionada:** fecha E3.
**Pré-requisitos:** UXA-006 a UXA-011.
**Escopo incluído:** suíte completa do shell (Testing Library + `jest-axe`) verde; verificação manual de responsividade em pelo menos 3 larguras de referência.
**Fora de escopo:** as telas internas (CRUDs, Dashboard, Editor).
**Arquivos/áreas:** nenhum novo — verificação.
**Critérios de aceite:** pipeline completo verde; shell operando nas 14 rotas existentes do Admin sem regressão de navegação.
**Testes esperados:** suíte completa do shell.
**Riscos:** nenhum.
**Dependências posteriores:** UXA-013 em diante, UXA-017 em diante.

### UXA-013 — Migração da tela de Produto
**Objetivo:** aplicar os padrões provados em Categoria (UXA-001 a UXA-004) à tela de Produto.
**Contexto/decisão relacionada:** replica UXA-005 como modelo.
**Pré-requisitos:** UXA-005, UXA-012.
**Escopo incluído:** lista e detalhe/form de Produto no novo padrão, Tailwind v4, remoção do CSS Module.
**Fora de escopo:** a seção de Ofertas embutida (UXA-014).
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/products/`.
**Critérios de aceite:** mesmo critério de UXA-005, aplicado a Produto.
**Testes esperados:** suíte completa da tela de Produto.
**Acessibilidade/responsividade:** mesmo critério de UXA-005.
**Riscos:** confirmar que o padrão extraído em UXA-001/002/003 realmente se aplica sem alteração estrutural — se exigir alteração relevante, é sinal de que a abstração foi extraída cedo demais; registrar e ajustar, não forçar encaixe.
**Dependências posteriores:** UXA-014.

### UXA-014 — Migração da seção de Ofertas embutida
**Objetivo:** aplicar o novo padrão à seção de Ofertas dentro do detalhe de Produto (sem rota própria, por decisão já congelada da Arquitetura).
**Contexto/decisão relacionada:** Architecture.md, Seção 32 — Ofertas deliberadamente sem página própria.
**Pré-requisitos:** UXA-013.
**Escopo incluído:** lista/form de Ofertas embutida, incluindo o destaque visual reduzido de Oferta indisponível (`inStock: false`) já exigido pela regra de negócio.
**Fora de escopo:** qualquer rota nova para Oferta.
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/products/[id]/` (seção de Ofertas).
**Critérios de aceite:** mesmo critério de UXA-013; destaque visual reduzido de Oferta indisponível não depende só de cor (texto/ícone também comunicam o estado).
**Testes esperados:** suíte da seção de Ofertas.
**Acessibilidade/responsividade:** estado "indisponível" comunicado de forma não exclusivamente cromática.
**Riscos:** nenhum.
**Dependências posteriores:** UXA-016.

### UXA-015 — Migração da tela de Autor
**Objetivo:** aplicar o novo padrão à tela de Autor, incluindo preparação do campo `avatarUrl` consistente com o fallback do byline público (UXW-010).
**Contexto/decisão relacionada:** Etapa D — byline público `name`+`avatarUrl`.
**Pré-requisitos:** UXA-005, UXA-012.
**Escopo incluído:** lista e detalhe/form de Autor no novo padrão; preview do avatar no próprio formulário do Admin, com o mesmo fallback visual planejado para o público.
**Fora de escopo:** `bio` no contrato público (fora do ciclo, já decidido).
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/authors/`.
**Critérios de aceite:** mesmo critério de UXA-005; preview de avatar ausente mostra o mesmo fallback que será usado no FastCompre.
**Testes esperados:** suíte completa da tela de Autor.
**Acessibilidade/responsividade:** mesmo critério de UXA-005; imagem de avatar com alt text apropriado (nome do Autor).
**Riscos:** nenhum.
**Dependências posteriores:** UXA-016, UXW-010.

### UXA-016 — Gate de fechamento: CRUDs do Admin migrados
**Objetivo:** revisão cruzada de acessibilidade/responsividade dos três CRUDs migrados (Produto, Ofertas, Autor), fechando E4.
**Contexto/decisão relacionada:** fecha E4.
**Pré-requisitos:** UXA-013, UXA-014, UXA-015.
**Escopo incluído:** checklist manual (teclado, foco, contraste, zoom 400%) nas três telas; `jest-axe` limpo nas três.
**Fora de escopo:** Dashboard, Editor.
**Arquivos/áreas:** nenhum novo — verificação.
**Critérios de aceite:** checklist sem pendência; suíte completa verde.
**Testes esperados:** suíte completa dos três CRUDs.
**Acessibilidade/responsividade:** este é o próprio critério de aceite.
**Riscos:** nenhum.
**Dependências posteriores:** UXA-017.

### UXA-017 — Dashboard: "Continuar de onde parei"
**Objetivo:** seção de Artigos em `DRAFT`, ordenados por `updatedAt desc`.
**Contexto/decisão relacionada:** Etapa C — Dashboard como novo destino padrão pós-login, seção explicitamente aprovada; Etapa D — ordenação pendente confirmada tecnicamente possível via UXF-012.
**Pré-requisitos:** UXF-012, UXA-012.
**Escopo incluído:** consulta e renderização da lista, link direto para cada Artigo.
**Fora de escopo:** as demais seções do Dashboard (UXA-018).
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/page.tsx` (novo Dashboard) ou equivalente.
**Critérios de aceite:** lista reflete `updatedAt desc` real; vazio mostra estado apropriado, não lista vazia sem contexto.
**Testes esperados:** Testing Library + `jest-axe`.
**Acessibilidade/responsividade:** lista navegável por teclado; responsiva.
**Riscos:** nenhum além do já registrado (sort não-indexado, aceitável na escala atual).
**Dependências posteriores:** UXA-019, UXA-020.

### UXA-018 — Dashboard: "Aguardando publicação" e "Publicados recentemente"
**Objetivo:** as duas seções restantes do Dashboard.
**Contexto/decisão relacionada:** Etapa C.
**Pré-requisitos:** UXA-017.
**Escopo incluído:** listagem de `PENDING_REVIEW` e de `PUBLISHED` recentes, reaproveitando `findManyBySite` existente (sem necessidade de `orderBy` novo nestas duas — `createdAt`/`publishedAt` já servem).
**Fora de escopo:** qualquer nova capacidade de backend além do já existente.
**Arquivos/áreas:** mesmo componente de UXA-017.
**Critérios de aceite:** as duas seções refletem dado real; navegação para o Artigo correspondente funciona.
**Testes esperados:** Testing Library + `jest-axe`.
**Acessibilidade/responsividade:** mesmo critério de UXA-017.
**Riscos:** nenhum.
**Dependências posteriores:** UXA-019.

### UXA-019 — Dashboard: atalhos de criação e estados
**Objetivo:** atalhos de criação role-gated + estados de loading/erro/vazio do Dashboard como um todo.
**Contexto/decisão relacionada:** Etapa C — Dashboard como ferramenta operacional para a persona Editor, não painel decorativo.
**Pré-requisitos:** UXA-017, UXA-018.
**Escopo incluído:** atalhos condicionados à Role (mesmo critério de UXA-010); tratamento de erro parcial (uma seção falha sem derrubar as outras).
**Fora de escopo:** métricas/analytics (fora do MVP e fora desta etapa).
**Arquivos/áreas:** mesmo componente de UXA-017.
**Critérios de aceite:** falha de uma seção isolada não impede a leitura das demais; atalhos respeitam Role.
**Testes esperados:** Testing Library cobrindo falha parcial + `jest-axe`.
**Acessibilidade/responsividade:** cada seção como região identificável (`aria-labelledby`).
**Riscos:** nenhum.
**Dependências posteriores:** UXA-020.

### UXA-020 — Gate de fechamento UX-M02: Dashboard + baseline visual
**Objetivo:** fechar o Dashboard e capturar o golden screenshot baseline desta superfície crítica, conforme a regra de que baselines nascem quando a tela é aprovada, não só em E13.
**Contexto/decisão relacionada:** regra nova desta rodada — "os golden screenshots/baselines das superfícies críticas devem nascer quando cada tela estiver aprovada (Dashboard em E5...)".
**Pré-requisitos:** UXA-017, UXA-018, UXA-019.
**Escopo incluído:** captura do baseline Playwright screenshot do Dashboard (estados populado e vazio); registro do baseline no repositório de referência da suíte de regressão visual (infraestrutura mínima de captura, mesmo sem o restante do runner de UXQ-001 existir ainda — este baseline fica pronto para ser consumido quando UXQ-001 for criado).
**Fora de escopo:** execução comparativa contra o baseline (isso só existe a partir de UXQ-001/UXQ-010).
**Arquivos/áreas:** novo diretório de baselines visuais (ex.: `apps/admin/e2e-visual/` ou equivalente a definir na implementação).
**Critérios de aceite:** Dashboard completo, testado, com baseline visual capturado e versionado; marco UX-M02 (Admin Rebuilt) fechado.
**Testes esperados:** suíte completa do Dashboard + captura de screenshot reproduzível.
**Acessibilidade/responsividade:** checklist final do Dashboard (herda de UXA-017/018/019).
**Riscos:** capturar baseline antes do runner completo (UXQ-001) existir exige que o mecanismo de captura em si já seja compatível com o que UXQ-001 vai formalizar — validar isso nesta tarefa evita retrabalho.
**Dependências posteriores:** UXQ-010 (reexecução consolidada).

---

## UXE — Editorial (E6 + E7 + E8)

Bloco comum: nenhuma tarefa desta seção altera a coluna `Article.bodyMdx` (permanece `String`, sem migração de formato) nem o invariante de que `ArticleProduct` é a única fonte estrutural de verdade — blocos editoriais só referenciam, nunca duplicam. `UXE-006` em diante só começa após `UXE-005` (Editorial Serialization Contract) aprovado.

### UXE-001 — Setup isolado do spike Lexical
**Objetivo:** ambiente isolado (fora dos apps reais) com Lexical + `@lexical/markdown`, mesma disciplina do sandbox usado na verificação empírica de segurança do MDX já realizada anteriormente neste ciclo.
**Contexto/decisão relacionada:** Etapa D — spike obrigatório antes da implementação completa do editor.
**Pré-requisitos:** nenhum (pode iniciar no dia 1, paralelo a UXF).
**Escopo incluído:** projeto sandbox versionado (não descartável sem registro), com Lexical na versão que será usada em produção.
**Fora de escopo:** qualquer integração com `apps/admin`.
**Arquivos/áreas:** ambiente de spike (local a definir, fora de `apps/`).
**Critérios de aceite:** ambiente reproduz um documento Lexical básico e o serializa/deserializa via `@lexical/markdown`.
**Testes esperados:** nenhum automatizado formal — é o instrumento de investigação.
**Riscos:** nenhum.
**Dependências posteriores:** UXE-002, UXE-003.

### UXE-002 — Round-trip 1: `bodyMdx` existente → Lexical → `bodyMdx`
**Objetivo:** validar empiricamente que conteúdo Markdown comum de Artigos já publicados sobrevive ao ciclo completo sem perda de fidelidade.
**Contexto/decisão relacionada:** Etapa D — compatibilidade obrigatória com conteúdo já publicado, sem migração.
**Pré-requisitos:** UXE-001.
**Escopo incluído:** amostra representativa de `bodyMdx` reais do projeto (variedade de formatação: títulos, ênfase, listas, links); comparação campo a campo do Markdown antes/depois do ciclo.
**Fora de escopo:** blocos Produto/Oferta (UXE-004).
**Arquivos/áreas:** ambiente de spike.
**Critérios de aceite:** divergência zero, ou divergências catalogadas e classificadas como aceitáveis (ex.: normalização de espaço em branco) vs. inaceitáveis (perda de conteúdo/formatação) — qualquer divergência inaceitável interrompe o spike e é trazida para decisão, não resolvida silenciosamente.
**Testes esperados:** script de comparação determinístico sobre a amostra.
**Riscos:** este é o risco central já registrado na Etapa D — se o round-trip não for fiel, a arquitetura do editor precisa ser revista antes de prosseguir.
**Dependências posteriores:** UXE-005.

### UXE-003 — Sintaxe customizada versionável + transformers Lexical
**Objetivo:** desenhar a sintaxe textual dos blocos de Produto/Oferta (embutida dentro do mesmo `bodyMdx`) e implementar os transformers de import/export do Lexical para ela.
**Contexto/decisão relacionada:** Etapa D, refinamento aprovado — sintaxe estável e versionável, não escolhida antecipadamente (diretiva, fenced block ou outra), decisão do spike.
**Pré-requisitos:** UXE-001.
**Escopo incluído:** escolha e versionamento explícito da sintaxe (ex.: campo de versão embutido, permitindo evolução futura sem quebrar conteúdo já serializado); transformers Lexical correspondentes.
**Fora de escopo:** a extensão do pipeline público que interpreta essa sintaxe (UXE-004 valida o round-trip completo; UXE-017 implementa em produção).
**Arquivos/áreas:** ambiente de spike; posteriormente `apps/admin` (transformers reais em UXE-006+).
**Critérios de aceite:** sintaxe documentada com versão explícita; nó Lexical de Produto/Oferta serializa e desserializa corretamente, carregando apenas `productId` (nunca snapshot de nome/preço/link).
**Testes esperados:** teste de round-trip do nó customizado isoladamente.
**Riscos:** sintaxe mal versionada desde o início dificultaria evolução futura sem quebrar conteúdo já publicado com blocos — versionamento explícito é o que evita esse risco.
**Dependências posteriores:** UXE-004, UXE-005, UXE-011, UXE-017.

### UXE-004 — Round-trip 2: bloco Produto/Oferta → sintaxe → pipeline FastCompre → componente público
**Objetivo:** validar empiricamente o ciclo completo do bloco customizado, incluindo resolução de `ArticleProduct` e verificação de segurança/regressão.
**Contexto/decisão relacionada:** Etapa D — segundo round-trip explicitamente exigido pelo spike.
**Pré-requisitos:** UXE-002, UXE-003.
**Escopo incluído:** protótipo mínimo do plugin/transform MDX (mesmo que descartável) capaz de reconhecer a sintaxe e resolver a referência contra dado real de `ArticleProduct`/`Product`/`Offer`; verificação de que a sintaxe não abre nenhuma superfície de injeção nova, na mesma disciplina empírica já usada na verificação original do MDX (`format: 'md'`).
**Fora de escopo:** implementação de produção do plugin (UXE-017).
**Arquivos/áreas:** ambiente de spike.
**Critérios de aceite:** bloco sobrevive ao ciclo completo; componente público resolvido reflete o estado real do vínculo (não um snapshot); nenhuma superfície de injeção nova identificada.
**Testes esperados:** script de verificação do round-trip completo + tentativas deliberadas de injeção (script/HTML/JSX) através da nova sintaxe.
**Riscos:** mesmo risco central de UXE-002, estendido à superfície de segurança — qualquer achado de risco interrompe o spike para decisão, não é mitigado silenciosamente.
**Dependências posteriores:** UXE-005.

### UXE-005 — Editorial Serialization Contract (gate)
**Objetivo:** consolidar os resultados de UXE-002 a UXE-004 num documento normativo, aprovado explicitamente, que se torna pré-requisito de UXE-006 e UXE-017.
**Contexto/decisão relacionada:** regra nova desta rodada — gate explícito antes de qualquer implementação de editor ou pipeline público.
**Pré-requisitos:** UXE-002, UXE-003, UXE-004.
**Escopo incluído:** documento cobrindo os seis pontos exigidos (round-trip do Markdown existente; sintaxe customizada versionável; import/export Lexical; resolução de Produto/Oferta; renderização pública correspondente; segurança/regressão), com decisão explícita registrada em cada um.
**Fora de escopo:** implementação de produção.
**Arquivos/áreas:** documento normativo — `docs/editorial/editorial-serialization-contract.md`.
**Critérios de aceite:** os seis pontos fechados e aprovados pelo usuário antes de qualquer tarefa UXE-006+ ou UXE-017+ iniciar.
**Testes esperados:** nenhum automatizado — é um gate de decisão.
**Riscos:** se qualquer um dos seis pontos não fechar com resultado aceitável, este é exatamente o tipo de contradição real que deve ser trazida para nova decisão, não resolvida por conta própria durante a implementação.
**Dependências posteriores:** UXE-006, UXE-017 (ambas só começam depois deste gate).

### UXE-006 — Integração base do Lexical no Admin
**Objetivo:** Lexical funcionando dentro do formulário de Artigo em `DRAFT`, client-only, SSR-safe.
**Contexto/decisão relacionada:** Etapa D — Lexical aprovado como arquitetura editorial.
**Pré-requisitos:** UXE-005 (gate aprovado), UXF-009, UXA-012.
**Escopo incluído:** substituição do `<textarea>` atual pelo editor Lexical básico (texto, parágrafo, título, ênfase, lista, link) usando os transformers de Markdown padrão + os customizados de UXE-003.
**Fora de escopo:** toolbar visual (UXE-007), autosave (UXE-008), blocos Produto/Oferta na UI (UXE-011).
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/articles/[id]/` (formulário de Artigo).
**Critérios de aceite:** editor carrega `bodyMdx` existente corretamente (inclusive Artigos já publicados reabertos via `ARCHIVED → DRAFT`); salva de volta como string Markdown compatível.
**Testes esperados:** Testing Library cobrindo carregar/editar/salvar; caso de regressão com Artigo real pré-existente.
**Acessibilidade/responsividade:** área de edição navegável por teclado desde a integração base (não adiado para depois).
**Riscos:** SSR/hidratação — mitigado por `'use client'` + guarda de renderização, mesmo padrão já documentado na pesquisa da Etapa D.
**Dependências posteriores:** UXE-007 a UXE-016.

### UXE-007 — Toolbar e menu de comando `/`
**Objetivo:** interface de formatação visível e o menu de inserção rápida.
**Contexto/decisão relacionada:** Etapa D — requisito explícito de suporte a menu `/`.
**Pré-requisitos:** UXE-006.
**Escopo incluído:** toolbar com as formatações suportadas pelo editor base; menu `/` para inserir título/lista/imagem/bloco Produto-Oferta (o item de bloco só fica funcional depois de UXE-011; até lá, item ausente do menu, não quebrado).
**Fora de escopo:** blocos avançados fora do escopo aprovado.
**Arquivos/áreas:** mesmo formulário de Artigo.
**Critérios de aceite:** toolbar e menu `/` operáveis por mouse e teclado; nenhum item do menu leva a estado quebrado.
**Testes esperados:** Testing Library + `jest-axe`.
**Acessibilidade/responsividade:** menu `/` como padrão de combobox acessível, mesmo critério de UXA-009.
**Riscos:** nenhum.
**Dependências posteriores:** UXE-011.

### UXE-008 — Autosave + pending-save guard
**Objetivo:** salvamento automático do corpo do Artigo, com o guard específico já congelado (avisa só sobre salvamento pendente/falho, nunca a cada tecla).
**Contexto/decisão relacionada:** Etapa C, refinamento aprovado — mecanismo distinto do dirty-state guard de UXA-003.
**Pré-requisitos:** UXE-006, UXA-004 (reaproveita o componente visual de feedback).
**Escopo incluído:** debounce de salvamento, indicador de estado (salvando/salvo/falhou), guard de navegação só quando há salvamento pendente ou com falha não resolvida.
**Fora de escopo:** o dirty-state guard comum (mecanismo diferente, não reaproveitado aqui).
**Arquivos/áreas:** mesmo formulário de Artigo.
**Critérios de aceite:** editar sem sair não dispara aviso; sair com salvamento pendente/falho dispara aviso; sair depois de salvo com sucesso não dispara nada.
**Testes esperados:** Testing Library cobrindo os três cenários.
**Acessibilidade/responsividade:** indicador de estado anunciado via `aria-live="polite"`, sem interromper a digitação.
**Riscos:** nenhum além do já mapeado na Etapa D.
**Dependências posteriores:** UXE-012.

### UXE-009 — Preview do Artigo
**Objetivo:** visualização do Artigo renderizado como ficaria publicamente, dentro do Admin.
**Contexto/decisão relacionada:** infraestrutura de preview já investigada em etapa anterior deste ciclo (reaproveitada, não redesenhada do zero).
**Pré-requisitos:** UXE-006.
**Escopo incluído:** renderização de preview usando o mesmo pipeline de compilação MDX que o FastCompre usará (coordenado com UXE-017 para blocos Produto/Oferta; até UXE-017 existir, preview de bloco pode mostrar um placeholder textual, nunca quebrar).
**Fora de escopo:** preview em nova aba/link compartilhável (sem requisito para isso).
**Arquivos/áreas:** mesmo formulário de Artigo.
**Critérios de aceite:** preview reflete fielmente o que será publicado para conteúdo Markdown comum; não quebra com blocos ainda não suportados pelo pipeline público.
**Testes esperados:** Testing Library cobrindo abrir preview e conferir conteúdo básico.
**Acessibilidade/responsividade:** preview navegável e com a mesma estrutura de heading que a página pública real terá.
**Riscos:** nenhum.
**Dependências posteriores:** nenhuma direta.

### UXE-010 — Upload/inserção de imagem com decisão explícita de acessibilidade
**Objetivo:** inserir imagem no corpo do Artigo reaproveitando o endpoint de upload existente, exigindo decisão explícita alt-text vs. decorativo no momento da inserção.
**Contexto/decisão relacionada:** Etapa C, refinamento aprovado — nunca alt não-vazio forçado; decisão explícita alt vs. `alt=""` decorativo.
**Pré-requisitos:** UXE-006.
**Escopo incluído:** fluxo de upload reaproveitando `POST /admin/sites/:siteSlug/uploads/images` (finalidade a definir — nova finalidade `ARTICLE_BODY_IMAGE` ou reaproveitamento de `ARTICLE_COVER`, decisão técnica a registrar na implementação); diálogo obrigatório de alt-text/decorativo antes da inserção ser concluída.
**Fora de escopo:** edição de imagem (crop/resize) — sem requisito para isso.
**Arquivos/áreas:** mesmo formulário de Artigo; possível extensão de `packages/contracts/src/admin/uploads/upload-purpose.ts`.
**Critérios de aceite:** imagem não é inserida sem a decisão explícita ser tomada; `alt=""` é uma escolha válida e deliberada, não um valor padrão silencioso.
**Testes esperados:** Testing Library cobrindo os dois caminhos (alt preenchido / decorativo).
**Acessibilidade/responsividade:** este é o próprio critério de aceite da tarefa.
**Riscos:** se a finalidade de upload exigir extensão do enum `uploadPurposeSchema`, isso é uma mudança de contrato pequena e aditiva — registrar explicitamente, não presumir.
**Dependências posteriores:** nenhuma direta.

### UXE-011 — Bloco Produto/Oferta: UI de inserção/edição
**Objetivo:** interface para inserir e editar o bloco customizado dentro do editor, referenciando `ArticleProduct` existente.
**Contexto/decisão relacionada:** Etapa D — invariante de `ArticleProduct` como única fonte de verdade; Etapa E, UXE-003 (transformers já definidos no spike).
**Pré-requisitos:** UXE-003 (sintaxe fechada), UXE-007 (menu `/`).
**Escopo incluído:** seleção de um Produto já vinculado ao Artigo (via `ArticleProduct`, mesma fonte de dado de `ArticleProductsSection`) para inserir como bloco visual no corpo; edição/remoção do bloco.
**Fora de escopo:** vincular um novo Produto ao Artigo a partir do editor (esse fluxo continua no painel lateral, UXE-014) — o editor só referencia vínculos já existentes.
**Arquivos/áreas:** mesmo formulário de Artigo.
**Critérios de aceite:** bloco inserido nunca duplica dado de Produto/Oferta — sempre resolve via `productId` no momento da renderização/preview; remover o bloco do corpo não desvincula o `ArticleProduct` (são operações independentes).
**Testes esperados:** Testing Library cobrindo inserir/editar/remover o bloco.
**Acessibilidade/responsividade:** bloco navegável por teclado como uma unidade (não fragmentos soltos de texto).
**Riscos:** nenhum além do já mapeado no gate UXE-005.
**Dependências posteriores:** UXE-016.

### UXE-012 — Painel lateral contextual do Artigo (desktop)
**Objetivo:** painel sempre visível com status, checklist de saúde e ações de transição, conforme composição aprovada na Etapa C.
**Contexto/decisão relacionada:** Etapa C — conteúdo/editor como superfície dominante + painel lateral contextual, não abas.
**Pré-requisitos:** UXE-006, UXE-008.
**Escopo incluído:** badge de status, checklist `/health` (reaproveitando a lógica já existente), painel de transição (reaproveitando `ArticleTransitionPanel`/`MIN_ROLE_BY_TRANSITION` já existentes).
**Fora de escopo:** a lista de Produtos vinculados (UXE-014, migra `ArticleProductsSection` para dentro deste painel).
**Arquivos/áreas:** mesmo formulário/detalhe de Artigo.
**Critérios de aceite:** painel sempre visível em desktop, nunca escondendo informação crítica de publicação atrás de interação extra.
**Testes esperados:** Testing Library + `jest-axe`.
**Acessibilidade/responsividade:** painel como região identificável (`aria-labelledby`), navegável por teclado independente do foco estar no editor.
**Riscos:** nenhum.
**Dependências posteriores:** UXE-013, UXE-014.

### UXE-013 — Painel lateral: adaptação responsiva
**Objetivo:** drawer/sheet retrátil em viewports estreitos, preservando acesso à informação crítica sem escondê-la definitivamente.
**Contexto/decisão relacionada:** Etapa C — composição diferente exigida para telas menores.
**Pré-requisitos:** UXE-012.
**Escopo incluído:** comportamento de abrir/fechar do painel em mobile; indicador visível de que há informação/ação pendente no painel mesmo fechado (ex.: badge de status sempre visível fora do drawer).
**Fora de escopo:** nenhum.
**Arquivos/áreas:** mesmo componente de UXE-012.
**Critérios de aceite:** em mobile, status/pendências continuam perceptíveis sem abrir o drawer; abrir/fechar acessível por teclado, foco preso quando aberto.
**Testes esperados:** Testing Library simulando viewport estreito + `jest-axe`.
**Acessibilidade/responsividade:** este é o próprio critério de aceite.
**Riscos:** nenhum.
**Dependências posteriores:** UXE-016.

### UXE-014 — `ArticleProductsSection` reskinada no painel lateral
**Objetivo:** migrar a seção de Produtos vinculados (hoje um componente separado abaixo do formulário) para dentro do novo painel lateral, no novo padrão visual.
**Contexto/decisão relacionada:** Etapa C — painel lateral mantém contexto editorial visível sem troca de aba; componente já existente (`article-products-section.tsx`), só reposicionado e reskinado.
**Pré-requisitos:** UXE-012.
**Escopo incluído:** mesma lógica funcional já existente (vincular/desvincular/reordenar via `position`, resposta do servidor sempre a fonte de verdade da ordem), aplicada ao novo padrão visual e de estado (UXA-001).
**Fora de escopo:** qualquer alteração de comportamento funcional — é reposicionamento visual, não mudança de regra.
**Arquivos/áreas:** `apps/admin/src/app/[siteSlug]/articles/[id]/article-products-section.tsx`.
**Critérios de aceite:** todo comportamento hoje coberto pelos testes existentes deste componente continua idêntico; visual migrado para o novo padrão.
**Testes esperados:** suíte existente do componente, adaptada ao novo markup, sem perda de cobertura.
**Acessibilidade/responsividade:** botões "mover para cima/baixo" preservam `aria-label` já existente; novo layout responsivo dentro do painel.
**Riscos:** nenhum — comportamento já validado, só a casca muda.
**Dependências posteriores:** UXE-016.

### UXE-015 — Suíte de testes consolidada do editor
**Objetivo:** cobertura Testing Library + `jest-axe` de ponta a ponta do fluxo do editor (UXE-006 a UXE-014 juntos).
**Contexto/decisão relacionada:** disciplina de teste já exigida em cada tarefa individual; esta tarefa fecha a integração entre elas.
**Pré-requisitos:** UXE-006 a UXE-014.
**Escopo incluído:** cenário completo (abrir Artigo em `DRAFT` → editar texto → inserir imagem → inserir bloco Produto/Oferta → autosave dispara → preview reflete → transição de status) como teste de integração.
**Fora de escopo:** Playwright (UXQ-002).
**Arquivos/áreas:** specs do formulário de Artigo.
**Critérios de aceite:** cenário completo verde; nenhuma regressão nos specs já existentes de Artigo.
**Testes esperados:** o próprio cenário de integração descrito.
**Acessibilidade/responsividade:** `jest-axe` limpo no cenário completo.
**Riscos:** nenhum.
**Dependências posteriores:** UXE-016.

### UXE-016 — Gate de fechamento UX-M03 (lado Admin) + baseline visual do Editor
**Objetivo:** fechar o editor no Admin e capturar o golden screenshot baseline desta superfície crítica, conforme a regra de que baselines nascem quando a tela é aprovada.
**Contexto/decisão relacionada:** regra nova desta rodada — baseline do Editor nasce em E7, não só em E13.
**Pré-requisitos:** UXE-015.
**Escopo incluído:** captura do baseline Playwright screenshot do editor (estado vazio, estado com conteúdo, estado com bloco Produto/Oferta), registrado no mesmo repositório de referência de UXA-020.
**Fora de escopo:** execução comparativa contra o baseline (UXQ-010).
**Arquivos/áreas:** mesmo diretório de baselines visuais criado em UXA-020.
**Critérios de aceite:** editor completo, testado, com baseline capturado; `<textarea>` antigo removido do código.
**Testes esperados:** suíte completa do editor (UXE-015) + captura de screenshot reproduzível.
**Riscos:** nenhum.
**Dependências posteriores:** UXQ-010.

### UXE-017 — Plugin/transform do pipeline MDX do FastCompre
**Objetivo:** implementação de produção do reconhecimento da sintaxe customizada no pipeline público, a partir do que foi fechado no Editorial Serialization Contract.
**Contexto/decisão relacionada:** Etapa D — pipeline público ganha extensão dedicada; corre em paralelo a UXE-006 em diante, ambos partindo do mesmo gate (UXE-005).
**Pré-requisitos:** UXE-005 (gate aprovado) — **não depende de UXE-006 a UXE-016 estarem completas**.
**Escopo incluído:** plugin/transform integrado ao `@mdx-js/mdx` existente, reconhecendo a sintaxe versionada de UXE-003.
**Fora de escopo:** qualquer alteração ao comportamento de segurança já verificado do `format: 'md'` para conteúdo comum.
**Arquivos/áreas:** `apps/fastcompre/src/` (pipeline de compilação MDX).
**Critérios de aceite:** sintaxe reconhecida corretamente; conteúdo Markdown comum sem a sintaxe nova continua compilando exatamente como hoje.
**Testes esperados:** unit do plugin/transform isolado.
**Riscos:** nenhum além do já mapeado no gate.
**Dependências posteriores:** UXE-018.

### UXE-018 — Resolução de `ArticleProduct`/`Product`/`Offer` na renderização pública
**Objetivo:** o componente público renderizado a partir do bloco reflete sempre o estado real do vínculo, nunca um valor embutido na sintaxe.
**Contexto/decisão relacionada:** invariante congelado na Etapa D.
**Pré-requisitos:** UXE-017.
**Escopo incluído:** resolução da referência (`productId`) contra a API pública no momento da renderização/revalidação, reaproveitando dado já exposto pelo detalhe público do Artigo (`products` com Ofertas filtradas).
**Fora de escopo:** qualquer novo endpoint — reaproveita o que o detalhe público de Artigo já retorna.
**Arquivos/áreas:** componente público de renderização de bloco, `apps/fastcompre/src/`.
**Critérios de aceite:** alterar preço/disponibilidade de uma Oferta e revalidar reflete a mudança no bloco renderizado, sem exigir reedição do Artigo.
**Testes esperados:** teste de integração cobrindo a atualização de Oferta refletida no bloco.
**Riscos:** nenhum.
**Dependências posteriores:** UXE-019.

### UXE-019 — Regressão: artigos publicados existentes sem blocos novos
**Objetivo:** confirmar que a extensão do pipeline não altera a renderização de nenhum Artigo já publicado que não usa a sintaxe nova.
**Contexto/decisão relacionada:** restrição inegociável da Etapa D — nenhuma proposta pode quebrar conteúdo publicado existente.
**Pré-requisitos:** UXE-017.
**Escopo incluído:** comparação de saída renderizada, antes/depois da extensão, para uma amostra de Artigos publicados reais.
**Fora de escopo:** nenhum.
**Arquivos/áreas:** suíte de teste do pipeline MDX do FastCompre.
**Critérios de aceite:** saída idêntica byte a byte (ou semanticamente idêntica, se houver normalização já esperada) para todo Artigo sem a sintaxe nova.
**Testes esperados:** teste de regressão automatizado sobre a amostra.
**Riscos:** este é o teste que efetivamente prova a restrição inegociável — falha aqui bloqueia o milestone, não é contornável.
**Dependências posteriores:** UXE-021.

### UXE-020 — Verificação de segurança da extensão do pipeline
**Objetivo:** repetir, contra a implementação de produção, a mesma verificação empírica de segurança já feita no spike (UXE-004) e na investigação original do MDX.
**Contexto/decisão relacionada:** disciplina já exigida no ciclo — nenhuma mudança no pipeline de compilação é aceita sem verificação empírica própria.
**Pré-requisitos:** UXE-017, UXE-018.
**Escopo incluído:** tentativas deliberadas de injeção via a nova sintaxe (script, JSX, HTML) contra a implementação real, não só o protótipo do spike.
**Fora de escopo:** nenhum.
**Arquivos/áreas:** suíte de teste de segurança do pipeline MDX.
**Critérios de aceite:** nenhuma superfície de injeção nova identificada; resultado documentado com o mesmo rigor do achado original sobre `format: 'md'`.
**Testes esperados:** suíte de segurança automatizada, reproduzível.
**Riscos:** achado positivo aqui é uma contradição real com o gate já aprovado — interrompe e volta para decisão, não é mitigado silenciosamente.
**Dependências posteriores:** UXE-021.

### UXE-021 — Gate de fechamento UX-M03 (lado público)
**Objetivo:** marco de fechamento da plataforma editorial — Artigo publicado com bloco novo funcionando ponta a ponta (Admin → API → FastCompre).
**Contexto/decisão relacionada:** fecha E8 e, junto de UXE-016, fecha UX-M03 por inteiro.
**Pré-requisitos:** UXE-019, UXE-020, UXE-016.
**Escopo incluído:** teste de ponta a ponta real: criar Artigo no Admin com bloco Produto/Oferta, publicar, conferir renderização no FastCompre.
**Fora de escopo:** nenhum.
**Arquivos/áreas:** nenhum novo — verificação.
**Critérios de aceite:** fluxo completo funcionando; UX-M03 Editorial Platform Ready fechado.
**Testes esperados:** o próprio fluxo ponta a ponta, registrado como e2e se viável no CI ou como verificação manual documentada.
**Riscos:** nenhum.
**Dependências posteriores:** UXQ-010, UX-M06.

---

## UXW — FastCompre / Web público (E9 + E10)

Bloco comum: nenhuma tarefa desta seção altera SEO estrutural já congelado (URL canônica, sitemap, JSON-LD derivado, SSR/SSG) além do necessário para a navegação nova. Toda tarefa desta seção carrega critério de performance desde a implementação, medido contra o budget de UXF-014 — E12/UXQ consolida e verifica, não define pela primeira vez.

### UXW-001 — Header público
**Objetivo:** identidade visual e navegação primária do FastCompre.
**Contexto/decisão relacionada:** Etapa B — Editorial Contemporâneo, Source Serif 4 para conteúdo editorial, Geist para elementos funcionais.
**Pré-requisitos:** UXF-009.
**Escopo incluído:** header aplicado às 3 rotas públicas existentes.
**Fora de escopo:** menu de Categorias (UXW-003).
**Arquivos/áreas:** `apps/fastcompre/src/app/` (layout raiz).
**Critérios de aceite:** header renderiza consistentemente nas 3 rotas; SSR preservado (conteúdo visível sem JS).
**Testes esperados:** teste `renderToStaticMarkup` (padrão já existente) + Testing Library para qualquer parte interativa.
**Acessibilidade/responsividade:** landmark `<header>`, responsivo mobile/desktop.
**Performance:** header não deve introduzir layout shift (CLS) mensurável — validar contra o budget de UXF-014.
**Riscos:** nenhum.
**Dependências posteriores:** UXW-003.

### UXW-002 — Footer público
**Objetivo:** footer com divulgação de afiliação sempre visível (exigência legal e editorial já registrada na Arquitetura).
**Contexto/decisão relacionada:** Architecture.md, Seção 33 — divulgação de afiliação visível é requisito, não boa prática opcional.
**Pré-requisitos:** UXF-009.
**Escopo incluído:** footer aplicado às 3 rotas, com o texto de divulgação sempre presente.
**Fora de escopo:** nenhum.
**Arquivos/áreas:** `apps/fastcompre/src/app/` (layout raiz).
**Critérios de aceite:** divulgação de afiliação presente e legível em todas as páginas, sem exigir interação para aparecer.
**Testes esperados:** teste `renderToStaticMarkup` confirmando presença do texto.
**Acessibilidade/responsividade:** landmark `<footer>`, contraste AA.
**Performance:** mesmo critério de UXW-001.
**Riscos:** nenhum.
**Dependências posteriores:** nenhuma direta.

### UXW-003 — Menu de Categorias
**Objetivo:** navegação por Categoria consumindo o endpoint público novo.
**Contexto/decisão relacionada:** Etapa C — menu de Categorias aprovado como capacidade mandatória do header, dependente do pré-requisito técnico; Etapa D/UXF-010 — endpoint implementado.
**Pré-requisitos:** UXW-001, UXF-010.
**Escopo incluído:** consumo do endpoint paginado (ou lista completa, se a contagem de Categorias tornar paginação desnecessária na prática — decisão de implementação, não arquitetural) no server component do header/layout.
**Fora de escopo:** derivar Categorias client-side a partir de Artigos já carregados — explicitamente rejeitado na Etapa C.
**Arquivos/áreas:** `apps/fastcompre/src/app/` (layout raiz), novo client de API pública.
**Critérios de aceite:** menu reflete exatamente as Categorias não-arquivadas do Site, ordenadas alfabeticamente.
**Testes esperados:** teste `renderToStaticMarkup` com mock do endpoint.
**Acessibilidade/responsividade:** menu navegável por teclado; item ativo indicado.
**Performance:** chamada ao endpoint ocorre em tempo de geração/revalidação (SSG+revalidação), nunca a cada acesso do visitante, mesmo critério já usado para o restante do conteúdo público.
**Riscos:** nenhum.
**Dependências posteriores:** UXW-004.

### UXW-004 — Drawer mobile de Categorias
**Objetivo:** adaptação responsiva do menu de Categorias para viewports estreitos.
**Contexto/decisão relacionada:** Etapa C — drawer mobile explicitamente aprovado; Etapa D — motivador direto da adição de `jsdom`+RTL ao FastCompre.
**Pré-requisitos:** UXW-003, UXF-008.
**Escopo incluído:** componente interativo client-side, abre/fecha por toque e teclado, foco preso quando aberto.
**Fora de escopo:** nenhum.
**Arquivos/áreas:** mesmo componente de UXW-003.
**Critérios de aceite:** mesmo critério de UXA-008, aplicado ao contexto público.
**Testes esperados:** primeiro uso real de Testing Library no FastCompre (via UXF-008) + `jest-axe`.
**Acessibilidade/responsividade:** este é o próprio critério de aceite.
**Performance:** componente client-side não deve atrasar LCP da página (carregamento não-bloqueante).
**Riscos:** nenhum.
**Dependências posteriores:** UXW-006.

### UXW-005 — Suíte de testes do shell público
**Objetivo:** consolidar cobertura Testing Library + `jest-axe` do header/footer/menu/drawer.
**Contexto/decisão relacionada:** fecha a parte de teste de E9.
**Pré-requisitos:** UXW-001 a UXW-004.
**Escopo incluído:** cenário de integração (carregar página → abrir menu mobile → navegar para Categoria).
**Fora de escopo:** Playwright (UXQ-003).
**Arquivos/áreas:** specs do shell público.
**Critérios de aceite:** cenário completo verde; os 10 specs `node`/`renderToStaticMarkup` existentes continuam intactos.
**Testes esperados:** o próprio cenário descrito.
**Riscos:** nenhum.
**Dependências posteriores:** UXW-006.

### UXW-006 — Gate de fechamento: shell público
**Objetivo:** marco de fechamento da navegação pública nova.
**Contexto/decisão relacionada:** fecha E9.
**Pré-requisitos:** UXW-005.
**Escopo incluído:** verificação de que SSR/SEO das 3 rotas existentes não regrediu (título, meta description, JSON-LD, URL canônica todos preservados).
**Fora de escopo:** conteúdo interno das páginas (UXW-007+).
**Arquivos/áreas:** nenhum novo — verificação.
**Critérios de aceite:** pipeline completo verde; SEO estrutural preservado byte a byte onde aplicável.
**Testes esperados:** suíte completa do shell.
**Performance:** medição intermediária contra o budget de UXF-014 (não a medição final, que é UXQ-007).
**Riscos:** nenhum.
**Dependências posteriores:** UXW-007 em diante.

### UXW-007 — Home pública redesenhada
**Objetivo:** listagem paginada de Artigos publicados no novo padrão visual.
**Contexto/decisão relacionada:** Etapa A/C — jornada do Comparador racional/Caçador de oferta como personas primárias.
**Pré-requisitos:** UXW-006.
**Escopo incluído:** listagem, estados de loading/erro/vazio, responsividade.
**Fora de escopo:** paginação em si (UXW-012, compartilhada com Categoria).
**Arquivos/áreas:** `apps/fastcompre/src/app/page.tsx`.
**Critérios de aceite:** conteúdo idêntico em SSR (sem JS) e após hidratação; ordenação `publishedAt desc` preservada (já era regra existente, não alterada).
**Testes esperados:** `renderToStaticMarkup` + Testing Library para partes interativas.
**Acessibilidade/responsividade:** heading único (H1), estrutura de heading correta para os cards de listagem.
**Performance:** medir contra o budget de UXF-014 para a rota Home nesta própria tarefa, não adiar para UXQ-007.
**Riscos:** nenhum.
**Dependências posteriores:** UXW-012, UXW-013, UXW-014.

### UXW-008 — Página de Categoria redesenhada
**Objetivo:** listagem filtrada por Categoria no novo padrão visual.
**Contexto/decisão relacionada:** mesma disciplina de UXW-007, aplicada à rota `/[categorySlug]`.
**Pré-requisitos:** UXW-006.
**Escopo incluído:** listagem filtrada, título/heading refletindo a Categoria, preservação do redirect 301 canônico já existente (não alterado).
**Fora de escopo:** nenhum.
**Arquivos/áreas:** `apps/fastcompre/src/app/[categorySlug]/page.tsx`.
**Critérios de aceite:** mesmo critério de UXW-007; comportamento de canônico/301 preservado exatamente como hoje.
**Testes esperados:** `renderToStaticMarkup` + teste de regressão do redirect canônico.
**Acessibilidade/responsividade:** mesmo critério de UXW-007.
**Performance:** mesmo critério de UXW-007, medido para esta rota.
**Riscos:** nenhum.
**Dependências posteriores:** UXW-012, UXW-013, UXW-014.

### UXW-009 — Página de Artigo: estrutura base + CTA de afiliado
**Objetivo:** estrutura da página de Artigo com tipografia editorial (Source Serif 4) e o CTA de afiliado com peso visual real.
**Contexto/decisão relacionada:** Etapa B — Source Serif 4 para título/corpo de Artigo; Etapa C, refinamento aprovado — CTA como botão com peso visual, nome acessível comunicando "abre em nova aba" (não só ícone).
**Pré-requisitos:** UXW-006.
**Escopo incluído:** estrutura da página, tipografia editorial aplicada ao corpo renderizado, CTA de afiliado apontando para `GET /r/:siteSlug/:offerId` (endpoint já existente, comportamento não alterado).
**Fora de escopo:** byline (UXW-010), blocos Produto/Oferta novos (UXW-011).
**Arquivos/áreas:** `apps/fastcompre/src/app/[categorySlug]/[articleSlug]/page.tsx`.
**Critérios de aceite:** nome acessível do CTA inclui indicação de nova aba (texto visualmente oculto concatenado, conforme já congelado); redirecionamento 302/410 do endpoint de tracking preservado sem alteração.
**Testes esperados:** `renderToStaticMarkup` verificando nome acessível do link; regressão do fluxo de clique/tracking existente.
**Acessibilidade/responsividade:** este é o próprio critério de aceite do CTA.
**Performance:** medir contra o budget de UXF-014 para a rota de Artigo (a mais pesada, por conter mais conteúdo/imagens).
**Riscos:** nenhum.
**Dependências posteriores:** UXW-010, UXW-011.

### UXW-010 — Byline
**Objetivo:** exibição de `name`+`avatarUrl` na página de Artigo, com fallback visual quando avatar ausente.
**Contexto/decisão relacionada:** Etapa D — byline mínima aprovada; ajuste desta rodada — UI deve suportar ausência de avatar com fallback visual apropriado.
**Pré-requisitos:** UXW-009, UXF-011.
**Escopo incluído:** exibição do nome do Autor; avatar com fallback (iniciais/ícone genérico) quando `avatarUrl` for `null`.
**Fora de escopo:** `bio`, página dedicada de Autor.
**Arquivos/áreas:** mesmo arquivo de UXW-009.
**Critérios de aceite:** Artigo sem Autor vinculado não quebra a página (byline simplesmente não aparece); Artigo com Autor sem avatar mostra o fallback, nunca espaço vazio ou ícone quebrado.
**Testes esperados:** `renderToStaticMarkup` cobrindo os três casos (sem Autor, com Autor sem avatar, com Autor e avatar).
**Acessibilidade/responsividade:** avatar com alt text (nome do Autor) ou `alt=""` quando o fallback for puramente decorativo com nome já visível ao lado.
**Performance:** imagem de avatar (quando existir) servida via `next/image` (UXW-013).
**Riscos:** nenhum.
**Dependências posteriores:** nenhuma direta.

### UXW-011 — Renderização de blocos Produto/Oferta na página de Artigo
**Objetivo:** integrar o componente público de bloco (UXE-018) à página de Artigo, incluindo o caso de artigos antigos sem blocos.
**Contexto/decisão relacionada:** Etapa D/UXE — pipeline MDX estendido; regra inegociável de não quebrar conteúdo antigo.
**Pré-requisitos:** UXW-009, UXE-018.
**Escopo incluído:** integração do componente de bloco na página real; verificação visual de Artigo antigo (sem blocos) lado a lado com Artigo novo (com blocos).
**Fora de escopo:** qualquer alteração ao conteúdo de Artigos já publicados.
**Arquivos/áreas:** mesmo arquivo de UXW-009.
**Critérios de aceite:** Artigo antigo renderiza exatamente como antes (regressão de UXE-019 validada em contexto real); Artigo novo com bloco renderiza o componente correto, com dado atual de `ArticleProduct`.
**Testes esperados:** `renderToStaticMarkup` para os dois casos.
**Acessibilidade/responsividade:** bloco renderizado como estrutura semântica própria (não texto solto), navegável e com CTA próprio seguindo o mesmo critério de UXW-009.
**Performance:** bloco não deve degradar LCP/CLS da página de Artigo — medir junto de UXW-009.
**Riscos:** nenhum além do já mapeado em UXE.
**Dependências posteriores:** UXW-016.

### UXW-012 — Paginação consistente
**Objetivo:** paginação nas listagens (Home e Categoria), usando o envelope já existente (`page`/`pageSize`/`total`/`totalPages`).
**Contexto/decisão relacionada:** `paginatedResponseSchema` já existente, sem mudança de contrato.
**Pré-requisitos:** UXW-007, UXW-008.
**Escopo incluído:** controle de paginação visual, navegação por URL (querystring ou rota, a definir na implementação), preservando SSR/SEO (páginas seguintes indexáveis).
**Fora de escopo:** busca textual (fora do MVP).
**Arquivos/áreas:** `apps/fastcompre/src/app/page.tsx`, `apps/fastcompre/src/app/[categorySlug]/page.tsx`.
**Critérios de aceite:** navegação entre páginas funcional via URL, sem depender exclusivamente de JS para acessar a página seguinte.
**Testes esperados:** `renderToStaticMarkup` cobrindo página 1 e página N.
**Acessibilidade/responsividade:** controles de paginação com `aria-label` descritivo ("Página 2 de 5"), navegáveis por teclado.
**Performance:** cada página paginada gerada/revalidada, não montada client-side.
**Riscos:** nenhum.
**Dependências posteriores:** nenhuma direta.

### UXW-013 — `next/image` aplicado às 3 páginas
**Objetivo:** configurar e aplicar `next/image` para toda imagem pública (capa de Artigo, avatar de Autor, imagem de Produto quando exibida).
**Contexto/decisão relacionada:** Etapa D — `next.config.ts` do FastCompre vazio hoje, precisa de `images.remotePatterns`.
**Pré-requisitos:** UXW-007, UXW-008, UXW-009, UXW-010.
**Escopo incluído:** configuração de `remotePatterns` apontando para o host do `StoragePort`; substituição de `<img>` cru por `next/image` nas 3 páginas.
**Fora de escopo:** otimização de imagens fora do que `next/image` já oferece por padrão.
**Arquivos/áreas:** `apps/fastcompre/next.config.ts`.
**Critérios de aceite:** imagens carregam corretamente em produção (não só em dev, onde `remotePatterns` é mais permissivo por padrão); LCP da imagem principal de cada página dentro do budget.
**Testes esperados:** verificação de build de produção real (mesmo critério de UXF-013).
**Acessibilidade/responsividade:** `alt` correto em cada uso (imagem de Produto, capa de Artigo, avatar).
**Performance:** este é o principal alavancador de LCP da rota de Artigo — medir explicitamente aqui, não só em UXQ-007.
**Riscos:** nenhum.
**Dependências posteriores:** UXW-016.

### UXW-014 — Estados 404/loading/error/empty + `prefers-reduced-motion`
**Objetivo:** aplicar o vocabulário de estados globais (Etapa C) às 3 páginas públicas, incluindo o único estado de erro já normativo na Arquitetura (**apenas 404**, sem página de erro genérica inventada).
**Contexto/decisão relacionada:** Implementation-Backlog.md original, Fase 12 — "apenas 404"; Etapa B — `prefers-reduced-motion` obrigatório desde a fundação.
**Pré-requisitos:** UXW-007, UXW-008, UXW-009.
**Escopo incluído:** página 404 no novo padrão visual; estado vazio da Home/Categoria (Site sem Artigo publicado ainda); qualquer animação/transição introduzida respeita `prefers-reduced-motion`.
**Fora de escopo:** criar uma página de erro genérica além do 404 — não é o padrão aprovado.
**Arquivos/áreas:** `apps/fastcompre/src/app/not-found.tsx` (ou equivalente), páginas de UXW-007/008.
**Critérios de aceite:** 404 real do Next.js customizado no novo padrão; estado vazio nunca aparenta erro.
**Testes esperados:** `renderToStaticMarkup` do 404 e dos estados vazios.
**Acessibilidade/responsividade:** `prefers-reduced-motion` verificável (nenhuma animação essencial sem alternativa estática).
**Performance:** 404 e estados vazios não devem carregar dependências desnecessárias (bundle mínimo).
**Riscos:** nenhum.
**Dependências posteriores:** UXW-016.

### UXW-015 — Golden screenshot baseline das superfícies públicas
**Objetivo:** capturar baseline visual de Home, Categoria e Artigo, conforme a regra de que baselines nascem quando a superfície é aprovada.
**Contexto/decisão relacionada:** regra nova desta rodada — baselines públicos nascem em E10, não só em E13.
**Pré-requisitos:** UXW-007 a UXW-014.
**Escopo incluído:** captura Playwright screenshot das 3 páginas (estado populado; Home/Categoria também no estado vazio), registrada no mesmo repositório de referência de UXA-020/UXE-016.
**Fora de escopo:** execução comparativa (UXQ-010).
**Arquivos/áreas:** mesmo diretório de baselines visuais (agora compartilhado entre Admin e FastCompre).
**Critérios de aceite:** baselines capturados e versionados para as 3 páginas.
**Testes esperados:** captura reproduzível via script.
**Riscos:** nenhum.
**Dependências posteriores:** UXQ-010.

### UXW-016 — Gate de fechamento UX-M04: FastCompre Rebuilt
**Objetivo:** marco de fechamento das páginas públicas novas.
**Contexto/decisão relacionada:** fecha E10. Ajuste desta rodada — a relação entre desvio de budget e os milestones deixa de ser ambígua (ver Critérios de aceite).
**Pré-requisitos:** UXW-011, UXW-012, UXW-013, UXW-014, UXW-015.
**Escopo incluído:** verificação de que o budget de performance de UXF-014 é atingido nas 3 páginas nesta implementação (medição intermediária); suíte completa verde.
**Fora de escopo:** a medição final consolidada (UXQ-007).
**Arquivos/áreas:** nenhum novo — verificação.
**Critérios de aceite:** 3 páginas em produção, funcionalmente completas e testadas — isso por si só já fecha **UX-M04**, independentemente do resultado de performance. Se o budget de UXF-014 não for atingido em alguma página, **UX-M04 fecha mesmo assim**, mas o desvio é registrado formalmente (página, métrica, valor medido vs. budget) como entrada obrigatória de `UXQ-007`; esse registro **bloqueia explicitamente o fechamento de UX-M05** (via `UXQ-008`/`UXQ-009`) até ser resolvido. O budget em si nunca é alterado por este registro — só a data em que é formalmente verificado como cumprido.
**Testes esperados:** suíte completa das 3 páginas.
**Performance:** critério de aceite central da tarefa, com a distinção acima entre o que fecha UX-M04 (completude funcional/visual) e o que fecha UX-M05 (cumprimento do budget).
**Riscos:** se o budget não for atingido aqui, é sinal antecipado para UXQ-008 — registrar imediatamente em vez de esperar até E12 para descobrir, exatamente para que UX-M05 não seja pego de surpresa.
**Dependências posteriores:** UXQ-007 (herda qualquer desvio já registrado aqui), UXQ-010.

---

## UXQ — Quality (E11 + E12 + E13)

Bloco comum: esta seção não introduz nenhuma preocupação nova de acessibilidade/performance — consolida e verifica o que já foi construído com critérios próprios em cada tarefa de UXA/UXE/UXW.

### UXQ-001 — Setup Playwright + `@axe-core/playwright`
**Objetivo:** scaffold de teste em browser real, com job dedicado no CI.
**Contexto/decisão relacionada:** Etapa D, Seção 4 — camada 2 de acessibilidade.
**Pré-requisitos:** nenhum (pode iniciar assim que houver ao menos um fluxo real para testar — tipicamente após UXA-012 ou UXW-006, o que ocorrer primeiro).
**Escopo incluído:** instalação, configuração de execução contra build real (Admin e FastCompre), job de CI próprio (separado do job unit/e2e existente, para não acoplar tempos de execução diferentes).
**Fora de escopo:** cenários específicos (UXQ-002, UXQ-003).
**Arquivos/áreas:** novo diretório de testes Playwright, `.github/workflows/ci.yml`.
**Critérios de aceite:** um cenário de prova (ex.: carregar a Home) roda e reporta violações de axe corretamente.
**Testes esperados:** o próprio cenário de prova.
**Riscos:** tempo de execução do job Playwright pode ser significativo — medir e decidir se roda em todo PR ou só em `main`, registrando a decisão.
**Dependências posteriores:** UXQ-002, UXQ-003.

### UXQ-002 — Cenários de acessibilidade camada 2 — Admin
**Objetivo:** cobrir os fluxos críticos do Admin em browser real: login, criar/editar Artigo, publicar.
**Contexto/decisão relacionada:** Etapa D — fluxos críticos já mapeados nas Etapas A–C.
**Pré-requisitos:** UXQ-001, UXA-016, UXE-016.
**Escopo incluído:** os três fluxos citados, cada um com verificação axe em pontos-chave da jornada (não só na carga inicial da página).
**Fora de escopo:** todo o restante do Admin — só os fluxos críticos, conforme decisão de não fazer regressão visual/a11y de toda a aplicação.
**Arquivos/áreas:** novo diretório de testes Playwright.
**Critérios de aceite:** os três fluxos passam sem violação axe.
**Testes esperados:** os três cenários descritos.
**Riscos:** nenhum.
**Dependências posteriores:** UXQ-006.

### UXQ-003 — Cenários de acessibilidade camada 2 — FastCompre
**Objetivo:** cobrir o fluxo crítico público: Home → Categoria → Artigo → clique de afiliado.
**Contexto/decisão relacionada:** mesma base de UXQ-002.
**Pré-requisitos:** UXQ-001, UXW-016.
**Escopo incluído:** o fluxo completo citado, incluindo verificação do CTA de afiliado e do redirecionamento.
**Fora de escopo:** nenhum além do fluxo citado.
**Arquivos/áreas:** novo diretório de testes Playwright.
**Critérios de aceite:** fluxo completo passa sem violação axe.
**Testes esperados:** o cenário descrito.
**Riscos:** nenhum.
**Dependências posteriores:** UXQ-006.

### UXQ-004 — Checklist manual WCAG 2.2 AA — Admin
**Objetivo:** verificação humana dos critérios que nenhuma automação comprova: teclado, foco, reflow/zoom 400%, leitor de tela.
**Contexto/decisão relacionada:** Etapa D, Seção 4 — declaração normativa de que axe não certifica WCAG.
**Pré-requisitos:** UXA-016, UXE-016.
**Escopo incluído:** checklist cobrindo shell, os três CRUDs, Dashboard e Editor, nos fluxos críticos já testados em UXQ-002.
**Fora de escopo:** nenhum.
**Arquivos/áreas:** documento de checklist (a incorporar como anexo deste backlog).
**Critérios de aceite:** checklist completo, sem pendência aberta, assinado.
**Testes esperados:** nenhum automatizado — é o próprio instrumento.
**Riscos:** achado de não-conformidade aqui é uma contradição real com critérios de aceite já declarados individualmente em cada tarefa — se ocorrer, volta para a tarefa de origem, não é resolvido genericamente aqui.
**Dependências posteriores:** UXQ-006.

### UXQ-005 — Checklist manual WCAG 2.2 AA — FastCompre
**Objetivo:** mesma verificação humana, aplicada ao shell público e às 3 páginas.
**Contexto/decisão relacionada:** mesma base de UXQ-004.
**Pré-requisitos:** UXW-016.
**Escopo incluído:** checklist cobrindo shell, Home, Categoria, Artigo (incluindo CTA de afiliado e byline).
**Fora de escopo:** nenhum.
**Arquivos/áreas:** mesmo documento de UXQ-004.
**Critérios de aceite:** mesmo critério de UXQ-004.
**Testes esperados:** nenhum automatizado.
**Riscos:** mesmo critério de UXQ-004.
**Dependências posteriores:** UXQ-006.

### UXQ-006 — Gate de fechamento UX-M05 (acessibilidade)
**Objetivo:** metade do fechamento do Quality Gate — acessibilidade.
**Contexto/decisão relacionada:** fecha a parte de acessibilidade de E11.
**Pré-requisitos:** UXQ-002, UXQ-003, UXQ-004, UXQ-005.
**Escopo incluído:** consolidação dos quatro resultados num registro único.
**Fora de escopo:** performance (UXQ-009 fecha a outra metade).
**Arquivos/áreas:** nenhum novo — verificação.
**Critérios de aceite:** suíte Playwright+axe verde; os dois checklists manuais assinados sem pendência.
**Testes esperados:** suíte completa de UXQ-002/003.
**Riscos:** nenhum.
**Dependências posteriores:** UXQ-014.

### UXQ-007 — Medição final de Core Web Vitals
**Objetivo:** medir LCP/CLS/INP/TTFB das 3 páginas do FastCompre em ambiente próximo de produção, contra o budget de UXF-014.
**Contexto/decisão relacionada:** regra desta rodada — E12 consolida/verifica, não define pela primeira vez (definição já ocorreu em UXF-014).
**Pré-requisitos:** UXW-016.
**Escopo incluído:** mesma metodologia/ferramenta de UXF-013, para comparabilidade direta.
**Fora de escopo:** nenhum.
**Arquivos/áreas:** mesmo script/relatório de UXF-013.
**Critérios de aceite:** relatório final comparável ao baseline original, com resultado por página frente ao budget.
**Testes esperados:** o próprio instrumento de medição.
**Performance:** este é o próprio critério de aceite da tarefa.
**Riscos:** nenhum.
**Dependências posteriores:** UXQ-008 (condicional), UXQ-009.

### UXQ-008 — Ajustes de performance (condicional)
**Objetivo:** corrigir qualquer página que não atinja o budget definido em UXF-014, identificada em UXQ-007.
**Contexto/decisão relacionada:** decorre diretamente do resultado de UXQ-007 — escopo só se define quando o resultado existir.
**Pré-requisitos:** UXQ-007.
**Escopo incluído:** a definir a partir do achado real (ex.: otimização de imagem além do já feito em UXW-013, redução de JS client-side, ajuste de estratégia de revalidação) — **não implementar preventivamente antes do resultado de UXQ-007 existir**.
**Fora de escopo:** qualquer mudança que não seja diretamente motivada por um desvio de budget medido.
**Arquivos/áreas:** a definir pelo achado.
**Critérios de aceite:** nova medição confirma budget atingido.
**Testes esperados:** remedição (reexecução de UXQ-007 no escopo afetado).
**Performance:** este é o próprio critério de aceite.
**Riscos:** se o budget se provar inatingível mesmo após ajustes razoáveis, isso é uma contradição real (budget definido em UXF-014 pode ter sido otimista) — trazer para decisão, não relaxar o budget silenciosamente.
**Dependências posteriores:** UXQ-009.

### UXQ-009 — Gate de fechamento UX-M05 (performance)
**Objetivo:** segunda metade do fechamento do Quality Gate.
**Contexto/decisão relacionada:** fecha E12 e, junto de UXQ-006, fecha UX-M05 por inteiro.
**Pré-requisitos:** UXQ-007, UXQ-008 (se aplicável).
**Escopo incluído:** registro final de que o budget de UXF-014 é cumprido nas 3 páginas.
**Fora de escopo:** nenhum.
**Arquivos/áreas:** nenhum novo — verificação.
**Critérios de aceite:** budget cumprido e documentado; UX-M05 Quality Gate Passed fechado (junto de UXQ-006).
**Testes esperados:** o relatório final de UXQ-007 (ou UXQ-008, se houve ajuste).
**Riscos:** nenhum.
**Dependências posteriores:** UXQ-014.

### UXQ-010 — Reexecução consolidada da regressão visual
**Objetivo:** reexecutar a suíte de regressão visual contra os baselines já nascidos em UXA-020 (Dashboard), UXE-016 (Editor) e UXW-015 (superfícies públicas) — não criar baselines novos aqui.
**Contexto/decisão relacionada:** regra desta rodada — "E13 consolida e reexecuta a suíte, não cria todos os baselines somente no final"; escopo deliberadamente restrito a superfícies críticas, não a aplicação inteira.
**Pré-requisitos:** UXA-020, UXE-016, UXW-015, UXQ-001.
**Escopo incluído:** execução comparativa Playwright screenshot contra os baselines existentes (Dashboard, Editor, Home, Categoria, Artigo); resolução de qualquer divergência real encontrada (atualização deliberada do baseline com justificativa, nunca aceite automático).
**Fora de escopo:** qualquer superfície fora das 5 já listadas — não é regressão visual de toda a aplicação.
**Arquivos/áreas:** mesmo diretório de baselines visuais consolidado ao longo do ciclo.
**Critérios de aceite:** suíte executa contra as 5 superfícies; divergência não-intencional bloqueia o fechamento; divergência intencional (mudança aprovada depois do baseline nascer) tem o baseline atualizado com registro do motivo.
**Testes esperados:** a própria suíte comparativa.
**Riscos:** nenhum.
**Dependências posteriores:** UXQ-013.

### UXQ-011 — QA visual manual final
**Objetivo:** revisão humana final do Admin e do FastCompre contra as Etapas A–D como fonte normativa.
**Contexto/decisão relacionada:** Etapas A–D congeladas são a fonte normativa deste ciclo inteiro.
**Pré-requisitos:** UXQ-006, UXQ-009, UXQ-010.
**Escopo incluído:** revisão de consistência visual (tokens, tipografia, densidade), revisão de copy/UX-writing contra os princípios de Content Design congelados na Etapa B.
**Fora de escopo:** "polimento" subjetivo sem critério — qualquer achado precisa ser referenciável a uma decisão já congelada nas Etapas A–D, não gosto pessoal introduzido agora.
**Arquivos/áreas:** nenhum novo — revisão.
**Critérios de aceite:** nenhuma divergência não-justificada frente às Etapas A–D.
**Testes esperados:** nenhum automatizado — é revisão humana estruturada.
**Riscos:** nenhum.
**Dependências posteriores:** UXQ-013.

### UXQ-012 — Verificação final de restrições funcionais
**Objetivo:** confirmar que nenhuma restrição funcional foi quebrada — Roles, tenancy, ciclo editorial, segurança, revalidação, tracking, contratos.
**Contexto/decisão relacionada:** restrição inegociável declarada desde o início da Etapa E.
**Pré-requisitos:** todas as tarefas UXA/UXE/UXW.
**Escopo incluído:** reexecução completa da suíte e2e original da API (77 specs) sem nenhuma alteração de comportamento esperado; reexecução da suíte de isolamento multi-tenant.
**Fora de escopo:** qualquer alteração a essa suíte além do estritamente necessário para os pré-requisitos técnicos já aprovados (UXF-010/011/012).
**Arquivos/áreas:** `apps/api/` (suíte e2e existente).
**Critérios de aceite:** 77 specs e2e originais + os novos specs de UXF-010/011/012 todos verdes, sem nenhum ajuste que mude comportamento não relacionado à Etapa E.
**Testes esperados:** a própria suíte e2e completa.
**Riscos:** este é o teste que prova a restrição mais importante do ciclo inteiro — qualquer falha aqui interrompe o fechamento, não é contornável.
**Dependências posteriores:** UXQ-013.

### UXQ-013 — Verificação final de CI
**Objetivo:** todos os jobs (unit da API, Admin, FastCompre, e2e da API, Playwright+axe, build/lint/typecheck) verdes num único pipeline.
**Contexto/decisão relacionada:** disciplina de CI já estabelecida desde o MVP (`ci.yml`), estendida ao longo desta etapa.
**Pré-requisitos:** UXQ-010, UXQ-011, UXQ-012.
**Escopo incluído:** execução do pipeline completo de ponta a ponta, incluindo o novo job de Playwright+axe (UXQ-001).
**Fora de escopo:** nenhum.
**Arquivos/áreas:** `.github/workflows/ci.yml`.
**Critérios de aceite:** pipeline inteiro verde numa única execução.
**Testes esperados:** o próprio pipeline.
**Riscos:** nenhum.
**Dependências posteriores:** UXQ-014.

### UXQ-014 — Fechamento formal de UX-M06 UI/UX Complete
**Objetivo:** declarar o milestone final, com dependência explícita de todos os anteriores.
**Contexto/decisão relacionada:** regra desta rodada — "UX-M06 deve declarar dependência explícita de UX-M01 a UX-M05 + E13, mesmo que o grafo técnico já garanta isso transitivamente."
**Pré-requisitos:** UX-M01 (UXF-009 + UXF-010/011/012/014), UX-M02 (UXA-020), UX-M03 (UXE-016 + UXE-021), UX-M04 (UXW-016), UX-M05 (UXQ-006 + UXQ-009), UXQ-013.
**Escopo incluído:** registro formal de que os cinco milestones anteriores e a verificação final de CI/regressão/restrições funcionais estão todos fechados, nesta ordem, sem nenhum pulado.
**Fora de escopo:** qualquer trabalho novo — esta tarefa é declarativa.
**Arquivos/áreas:** nenhum — registro no próprio backlog.
**Critérios de aceite:** os cinco milestones + E13 explicitamente listados como concluídos, com data e referência à tarefa de fechamento de cada um.
**Testes esperados:** nenhum novo — herda todos os testes já verdes das dependências.
**Riscos:** nenhum.
**Dependências posteriores:** nenhuma — é o fechamento do ciclo.

---

## Mapa de dependências (visão consolidada)

Reconstruído mecanicamente a partir do campo `Pré-requisitos` de cada uma das 85 tarefas — `→` é uma dependência real listada; `∥` liga tarefas que compartilham o(s) mesmo(s) pré-requisito(s) e portanto podem rodar ao mesmo tempo; `{A,B,C} → D` significa que `D` só começa quando todas as tarefas do conjunto terminarem.

```
UXF (Foundation)
  UXF-001 → UXF-002
  UXF-002 → UXF-003 → UXF-004
  UXF-002 → UXF-006                          (∥ ao ramo 003→004)
  {UXF-001, UXF-002, UXF-004} → UXF-005 → UXF-007
  UXF-008                                     (sem pré-requisito — paralelo a 001–007 desde o dia 1)
  {UXF-001..UXF-008} → UXF-009 (gate)
  UXF-010 ∥ UXF-011 ∥ UXF-012                (sem pré-requisito — paralelos entre si e a UXF-001–009)
  UXF-013 → UXF-014                           (sem pré-requisito de UXF-013 — paralelo ao restante)

UXA (Admin)
  UXF-009 → UXA-001 ∥ UXA-002                 (ambas dependem só de UXF-009 — paralelas, não sequenciais)
  UXA-002 → UXA-003 ∥ UXA-004                 (ambas dependem só de UXA-002 — paralelas)
  {UXA-001, UXA-002, UXA-003, UXA-004} → UXA-005 (gate E2 — local-vs-promovido decidido aqui, tarefa a tarefa)
  {UXF-009, UXA-005} → UXA-006 → UXA-007
  {UXA-006, UXA-007} → UXA-008
  UXA-007 → UXA-009 → UXA-010                 (∥ ao ramo UXA-008)
  {UXA-006, UXA-007, UXA-008} → UXA-011       (não depende de UXA-009/010)
  {UXA-006..UXA-011} → UXA-012 (gate E3)
  {UXA-005, UXA-012} → UXA-013 → UXA-014      (∥ ao ramo UXA-015)
  {UXA-005, UXA-012} → UXA-015                (paralela a UXA-013→014, não depende dela)
  {UXA-013, UXA-014, UXA-015} → UXA-016 (gate E4)
  {UXF-012, UXA-012} → UXA-017 → UXA-018 → UXA-019 → UXA-020 (gate E5/UX-M02 — ramo paralelo a UXA-013…016 desde UXA-012)

UXE (Editorial)
  UXE-001 → UXE-002 ∥ UXE-003                 (ambas dependem só de UXE-001)
  {UXE-002, UXE-003} → UXE-004
  {UXE-002, UXE-003, UXE-004} → UXE-005 (GATE — Editorial Serialization Contract)
  {UXE-005, UXF-009, UXA-012} → UXE-006
  UXE-006 → UXE-007 ∥ UXE-009 ∥ UXE-010       (três dependem só de UXE-006)
  {UXE-006, UXA-004} → UXE-008                (∥ às três acima)
  {UXE-003, UXE-007} → UXE-011
  {UXE-006, UXE-008} → UXE-012 → UXE-013 ∥ UXE-014 (ambas dependem só de UXE-012)
  {UXE-006, UXE-007, UXE-008, UXE-009, UXE-010, UXE-011, UXE-012, UXE-013, UXE-014} → UXE-015 (convergência dos 4 ramos)
  UXE-015 → UXE-016 (gate, lado Admin)
  UXE-005 → UXE-017                            (paralelo a todo o ramo UXE-006…016, mesmo gate de origem)
  UXE-017 → UXE-018 ∥ UXE-019                  (ambas dependem só de UXE-017)
  {UXE-017, UXE-018} → UXE-020
  {UXE-019, UXE-020, UXE-016} → UXE-021 (gate, lado público — fecha UX-M03 junto de UXE-016)

UXW (FastCompre)
  UXF-009 → UXW-001 ∥ UXW-002                  (ambas dependem só de UXF-009)
  {UXW-001, UXF-010} → UXW-003
  {UXW-003, UXF-008} → UXW-004
  {UXW-001, UXW-002, UXW-003, UXW-004} → UXW-005 → UXW-006 (gate E9)
  UXW-006 → UXW-007 ∥ UXW-008 ∥ UXW-009        (três dependem só de UXW-006)
  {UXW-009, UXF-011} → UXW-010                 (∥ a UXW-011, ambas partem de UXW-009)
  {UXW-009, UXE-018} → UXW-011
  {UXW-007, UXW-008} → UXW-012                 (não depende de UXW-009/010/011)
  {UXW-007, UXW-008, UXW-009, UXW-010} → UXW-013
  {UXW-007, UXW-008, UXW-009} → UXW-014        (não depende de UXW-010/011/012/013 — disponível cedo, em paralelo a esse ramo inteiro)
  {UXW-007..UXW-014} → UXW-015
  {UXW-011, UXW-012, UXW-013, UXW-014, UXW-015} → UXW-016 (gate E10/UX-M04)

UXQ (Quality)
  UXQ-001                                       (sem pré-requisito formal — nasce, na prática, junto do primeiro fluxo real testável: UXA-012 ou UXW-006, o que ocorrer primeiro; NÃO depende de UXA-016/UXE-016/UXW-016)
  {UXQ-001, UXA-016, UXE-016} → UXQ-002
  {UXQ-001, UXW-016} → UXQ-003
  {UXA-016, UXE-016} → UXQ-004                 (independente de UXQ-001 — não usa Playwright)
  UXW-016 → UXQ-005                            (independente de UXQ-001)
  {UXQ-002, UXQ-003, UXQ-004, UXQ-005} → UXQ-006 (gate a11y, metade de UX-M05)
  UXW-016 → UXQ-007 → UXQ-008 (condicional) → UXQ-009 (gate performance, metade de UX-M05 — herda qualquer desvio já registrado em UXW-016)
  {UXA-020, UXE-016, UXW-015, UXQ-001} → UXQ-010
  {UXQ-006, UXQ-009, UXQ-010} → UXQ-011 → UXQ-012 → UXQ-013
  {UX-M01, UX-M02, UX-M03, UX-M04, UX-M05, UXQ-013} → UXQ-014 (UX-M06)
```

## Milestones

| Milestone | Fecha com | Depende de |
|---|---|---|
| **UX-M01 Foundations Ready** | UXF-009 + UXF-010/011/012 + UXF-014 | Nada além do estado atual do MVP |
| **UX-M02 Admin Rebuilt** | UXA-020 | UX-M01 |
| **UX-M03 Editorial Platform Ready** | UXE-016 + UXE-021 | UX-M01, UX-M02 (compartilha shell/painel) |
| **UX-M04 FastCompre Rebuilt** | UXW-016 | UX-M01 — **fecha independentemente do resultado de performance**; desvio de budget, se houver, é só registrado (ver UXW-016), não bloqueia este milestone |
| **UX-M05 Quality Gate Passed** | UXQ-006 + UXQ-009 | UX-M02, UX-M03, UX-M04 — **bloqueado** até qualquer desvio de budget registrado em UXW-016 ser resolvido via UXQ-008/UXQ-009 |
| **UX-M06 UI/UX Complete** | UXQ-014 | **Dependência explícita declarada:** UX-M01 + UX-M02 + UX-M03 + UX-M04 + UX-M05 + E13 (UXQ-010 a UXQ-013) |

## Caminhos críticos concorrentes

**Caminho A — Admin:** `UXF-009 → {UXA-001∥UXA-002} → {UXA-003∥UXA-004} → UXA-005 (gate) → UXA-006 → UXA-007 → UXA-008 → UXA-011 → UXA-012 (gate) → {UXA-013→UXA-014 ∥ UXA-015} → UXA-016`, com o ramo `UXA-012 → UXA-017→018→019→020` correndo em paralelo a `UXA-013…016` a partir do mesmo gate. A cadeia mais longa desse caminho tem 8 passos sequenciais entre `UXF-009` e `UXA-012` (contando o gate), não os "quase 20 tarefas em linha" que uma leitura superficial da lista sugeriria — grande parte do bloco corre em paralelo.

**Caminho B — Editorial:** `UXE-001 → {UXE-002∥UXE-003} → UXE-004 → UXE-005 (GATE)`, e daí em diante **dois ramos paralelos a partir do mesmo gate**: o ramo do editor (`UXE-006 → {UXE-007∥UXE-008∥UXE-009∥UXE-010} → ... → UXE-015 → UXE-016`, cuja cadeia mais longa é `006→008→012→013(ou 014)→015→016`, 6 passos após o gate) e o ramo do pipeline público (`UXE-017 → {UXE-018∥UXE-019} → UXE-020 → UXE-021`, 4 passos após o gate). `UXE-021` também precisa de `UXE-016`.

**Caminho C — FastCompre:** `UXF-009 + UXF-010 → UXW-001 → UXW-003 → UXW-004 → UXW-005 → UXW-006 (gate) → {UXW-007∥UXW-008∥UXW-009} → ... → UXW-016`, com `UXW-014` disponível cedo (logo após `UXW-007/008/009`, sem esperar `UXW-010…013`) e `UXW-011` bloqueada especificamente por `UXE-018` — ou seja, o Caminho C só fecha de fato depois que o ramo público de `UXE` (não o ramo do editor) estiver pronto.

**Qual caminho é o mais longo** depende de esforço por tarefa, não só contagem — o Caminho B tem o maior número de passos estritamente sequenciais concentrados num único ramo (`UXE-006→008→012→01x→015→016`), mas os Caminhos A e C têm mais tarefas no total. Não presumir qual fecha por último sem estimar esforço na implementação real.

**Convergência:** `UXQ-006` (a11y) e `UXQ-009` (performance) exigem os três caminhos substancialmente fechados (via `UXA-016`/`UXE-016`/`UXW-016`). `UXQ-010…014` é o único trecho que depende de absolutamente tudo, incluindo os baselines visuais nascidos ao longo de todo o ciclo.

## Tarefas paralelizáveis (mesmo momento do ciclo)

**Desde o dia 1 (sem nenhum pré-requisito real):** `UXF-001` ∥ `UXF-008` ∥ `UXF-010` ∥ `UXF-011` ∥ `UXF-012` ∥ `UXF-013` ∥ `UXE-001` ∥ `UXQ-001` (esta última só efetivamente útil depois do primeiro fluxo real existir, mas seu *scaffold* não tem pré-requisito técnico).

**Dentro de UXA:** `UXA-001` ∥ `UXA-002`; depois, `UXA-003` ∥ `UXA-004`; depois de `UXA-012`, o ramo `UXA-013→014` ∥ `UXA-015` ∥ (`UXA-017→018→019→020`, que só precisa também de `UXF-012`).

**Dentro de UXE:** a partir de `UXE-006`, quatro ramos simultâneos — `UXE-007→011`, `UXE-008→012→{013∥014}`, `UXE-009`, `UXE-010` — todos convergindo só em `UXE-015`. Em paralelo a esse bloco inteiro, a partir do gate `UXE-005`: `UXE-017→{018∥019}→020→021`.

**Dentro de UXW:** `UXW-001` ∥ `UXW-002`; depois de `UXW-006`, `UXW-007` ∥ `UXW-008` ∥ `UXW-009`; depois de `UXW-009`, `UXW-010` ∥ `UXW-011`; `UXW-012` não depende de `UXW-009/010/011` e pode rodar assim que `UXW-007`+`UXW-008` estiverem prontos; **`UXW-014` não depende de `UXW-010/011/012/013`** e fica disponível assim que `UXW-007/008/009` terminarem — pode ser implementada bem antes de `UXW-013`, mesmo estando listada depois na numeração.

**Entre trilhas:** a trilha Admin (`UXA-*`), a trilha Editorial (`UXE-006…016` e `UXE-017…021` entre si), e a trilha FastCompre (`UXW-*`, que só encosta em `UXE-018` na própria `UXW-011`) correm inteiramente em paralelo depois de `UX-M01`.

**Dentro de UXQ:** `UXQ-004` ∥ `UXQ-005` não dependem de `UXQ-001`; `UXQ-002`/`UXQ-003` dependem de `UXQ-001` mas podem rodar em paralelo entre si; `UXQ-007` (performance) corre em paralelo ao bloco `UXQ-002…006` (a11y) inteiro, ambos dependendo só de `UXW-016`/`UXA-016`/`UXE-016`.

## Sequência recomendada de implementação para futuros chats

1. Abrir cada sessão de implementação referenciando este documento e as Etapas A–D como fonte normativa — nunca reabrir decisão já congelada.
2. Implementar `UXF-001` a `UXF-009` (a cadeia real é `001→002→{003→004 ∥ 006}→005→007`, mais `008` solto, convergindo em `009`) — é a única dependência comum a quase tudo.
3. Em paralelo, iniciar `UXF-010` ∥ `UXF-011` ∥ `UXF-012` (pequenas, baixo risco) e `UXF-013→014` (baseline+budget, sem dependência técnica de UXF-001–009).
4. Iniciar `UXE-001` a `UXE-005` o mais cedo possível — mesmo antes de UX-M01 fechar, já que não depende de `packages/ui`. **Não avançar para `UXE-006` ou `UXE-017` sem o Editorial Serialization Contract (UXE-005) explicitamente aprovado pelo usuário.**
5. Depois de UX-M01: em UXA, aproveitar o paralelismo real — `UXA-001`∥`UXA-002` primeiro, depois `UXA-003`∥`UXA-004`, fechando `UXA-005` só quando os quatro terminarem (decidindo ali, tarefa a tarefa, o que fica local e o que é promovido). O restante do shell (`UXA-006…012`) é majoritariamente sequencial, com o pequeno paralelismo `UXA-008`∥`UXA-009→010`. Depois de `UXA-012`, os ramos CRUD (`UXA-013…016`) e Dashboard (`UXA-017…020`) correm em paralelo.
6. Em UXE, depois do gate `UXE-005`: os dois ramos (editor `UXE-006…016` e pipeline público `UXE-017…021`) correm em paralelo desde o início — não sequenciar um depois do outro. Dentro do ramo do editor, os quatro sub-ramos a partir de `UXE-006` também são paralelos entre si.
7. `UXW-001` a `UXW-006` podem começar assim que `UXF-010` estiver pronto, sem esperar a trilha Admin. Dentro de `UXW-007…016`, aproveitar que `UXW-012` e `UXW-014` não dependem do ramo `UXW-010→011→013` — podem ser adiantadas. `UXW-011` continua sendo o ponto de espera real (depende de `UXE-018`).
8. Cada tarefa que produz um baseline visual (`UXA-020`, `UXE-016`, `UXW-015`) deve capturá-lo no momento indicado — não adiar para o final.
9. `UXQ-001` (scaffold) pode nascer assim que houver o primeiro fluxo real testável (tipicamente logo após `UXA-012` ou `UXW-006`) — **não espera `UXA-016`/`UXE-016`/`UXW-016`**; só os cenários completos (`UXQ-002`/`UXQ-003`) esperam essas superfícies. `UXQ-004`/`UXQ-005` (checklists manuais) nem dependem do scaffold — podem começar em paralelo a ele.
10. Registrar imediatamente em `UXW-016` qualquer desvio de performance encontrado — isso não impede `UX-M04` de fechar, mas é entrada obrigatória de `UXQ-007`/`UXQ-008` e bloqueia `UX-M05` até resolvido.
11. Fechar `UX-M05` (`UXQ-006`+`UXQ-009`) antes de iniciar `UXQ-010` em diante.
12. `UXQ-014` é sempre a última tarefa do ciclo — sua própria definição de pronto exige os cinco milestones anteriores e `E13` explicitamente registrados, não apenas implicados pelo grafo técnico.
13. Se, durante a implementação de qualquer tarefa, surgir uma contradição real com o que está aqui documentado (achado técnico nas Etapas A–D, resultado inesperado do spike, budget de performance inatingível mesmo após ajuste, sintaxe do bloco editorial se revelando instável) — **interromper e trazer para aprovação, nunca decidir silenciosamente**, mesma disciplina usada em todo este ciclo de planejamento.
