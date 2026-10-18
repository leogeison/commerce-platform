# Checklist manual WCAG 2.2 AA — Commerce Platform

> Instrumento único compartilhado entre **UXQ-004** (Admin) e **UXQ-005** (FastCompre), conforme `UX-Implementation-Backlog.md` ("mesmo documento de UXQ-004"). As duas verificações manuais estão registradas neste documento.
>
> Este documento é o instrumento em si — nenhuma linha de resultado é preenchida por quem o cria. O preenchimento de PASS/FAIL/N/A, evidências e o cabeçalho de execução é feito pelo Product Owner (ou quem executar a verificação manual), nunca antecipado aqui.

---

## 1. Metodologia comum (UXQ-004 / UXQ-005)

### 1.1 Objetivo e papel deste instrumento

Este documento cobre exclusivamente o que nenhuma automação comprova: navegação por teclado, gestão de foco, reflow/zoom 400% e leitor de tela, em browser real.

Ele **não substitui, não duplica e não reabre** os gates automatizados já existentes:

- **Camada 1 — regressão de componente**: `jest-axe` + Testing Library (CI, obrigatório), ativado desde `UXF-007`.
- **Camada 2 — browser real**: Playwright + `@axe-core/playwright` (`UXQ-001`), com os três fluxos críticos do Admin cobertos em `UXQ-002` (`apps/admin/e2e-a11y/*.spec.ts`).
- **Camada 3 — este instrumento**: verificação humana, não automatizável, que a axe (camadas 1 e 2) **nunca certifica** como conformidade WCAG — axe captura um subconjunto de violações técnicas detectáveis por heurística; não comprova operabilidade real por teclado, coerência de foco, legibilidade em zoom real nem experiência real com leitor de tela.

Nenhuma linha deste documento é satisfeita por um resultado verde de `jest-axe`/Playwright. A ausência de violação axe numa tela não dispensa a verificação manual correspondente.

### 1.2 Legenda de resultado

| Resultado | Significado |
|---|---|
| **PASS** | Comportamento esperado observado integralmente, sem desvio, no ambiente de baseline (Seção 1.5). |
| **FAIL** | Qualquer desvio do comportamento esperado/critério WCAG 2.2 AA referenciado, mesmo parcial. Exige evidência e, sempre que identificável, a tarefa de origem cujo critério de aceite é contradito. |
| **N/A** | O item não se aplica a esta jornada/superfície (ex.: "mensagem de saving" numa tela sem ação de salvar). Exige justificativa de uma linha. Nunca usado para pular um item realmente aplicável. |

Campo vazio = item ainda não executado. Não confundir com N/A.

### 1.3 Regra de dívida técnica conhecida

**Zero exceções.** Uma não-conformidade real observada durante a execução é **FAIL**, independentemente de already ter sido registrada como débito técnico conhecido em qualquer tarefa anterior (ex.: overflow horizontal em Artigos/Produtos em larguras estreitas, citado como risco em `UXA-019B`). Débito técnico conhecido não é motivo para marcar PASS, nem para marcar N/A, nem para abrir uma exceção automática neste instrumento.

### 1.4 Regra de fechamento

- **Concluída**: toda linha de uma seção (Admin ou FastCompre) é `PASS` ou `N/A` justificado — **zero FAIL pendente** nessa seção.
- **Em andamento / bloqueada**: existe ao menos um FAIL não resolvido. Não pode ser assinada como "Concluída" nesse estado, mesmo com achados já registrados/triados.
- O documento mantém histórico de achados e retestes (Seção 2.4): quando um FAIL é corrigido na tarefa de origem, o reteste é registrado como uma nova entrada vinculada à linha original, e só então a linha correspondente pode mudar para PASS.

### 1.5 Baseline de ambiente (fechado, sem matriz adicional)

**Windows + Chrome (última versão estável) + NVDA (última versão estável).** Nenhuma outra combinação de SO/navegador/leitor de tela entra neste ciclo (UXQ-004 ou UXQ-005).

### 1.6 Convenção de reflow/zoom 400% (WCAG 1.4.10)

- Zoom real do navegador (`Ctrl`/`Cmd` + `+` até 400%), nunca redução/simulação de viewport.
- Equivalência padrão adotada: **largura inicial de viewport 1280 CSS px a 400% de zoom**, como aproximação operacional da referência de 320 CSS px efetivos do critério 1.4.10. Qualquer teste que use configuração diferente deve documentar explicitamente a largura inicial e o zoom usados, com a justificativa técnica para o desvio — nunca silenciosamente.
- Toda linha **RFL** registra obrigatoriamente, no campo **Evidência/Observação** da própria tabela (não existem colunas dedicadas para isso), o viewport inicial e o zoom aplicado, no formato `Viewport inicial: 1280 CSS px; Zoom: 400%` — ou os valores reais usados, com justificativa técnica explícita para qualquer desvio.
- Uma violação observada nessa configuração é **FAIL**, mesmo que a causa já seja um débito técnico conhecido (Seção 1.3).

### 1.7 Convenção de foco por padrão de componente real

Nenhuma regra genérica de overlay. O comportamento esperado é definido pelo padrão ARIA real implementado em cada componente, confirmado por leitura do código, não presumido:

| Padrão real | Onde ocorre no Admin | Comportamento esperado |
|---|---|---|
| **Diálogo modal com focus-trap (manual)** | Diálogos de inserção com `querySelectorAll('button:not(:disabled), input/select:not(:disabled)')` (Editor) | Abertura move foco para dentro do diálogo; `Tab` fica contido nos elementos nativos focáveis; fechar (`Escape`/cancelar) retorna o foco ao elemento disparador. |
| **Diálogo modal nativo (`<dialog>` + `showModal()`)** | Drawer mobile do shell (`sidebar-nav.tsx`, confirmado por leitura do código: "Drawer via `<dialog>` nativo + `showModal()`") | Foco preso nativamente ao conteúdo do `<dialog>` (nenhum elemento fora dele é alcançável enquanto aberto); foco inicial no botão de fechamento (`autoFocus`); `Escape` fecha nativamente (evento `cancel` → `close()`); ao fechar, o próprio navegador restaura o foco ao elemento que disparou a abertura. |
| **Combobox/listbox não-modal (`aria-activedescendant`)** | Slash menu do Editor (`role="textbox"` + `aria-autocomplete`/`aria-controls`/`aria-activedescendant`; popover `role="listbox"`, itens `role="option"`) e Command Palette (mesmo modelo, grupos via `role="group"` dentro da listbox) | Foco físico **permanece** no editor/campo de busca durante toda a navegação; `ArrowUp`/`ArrowDown` movem só o `aria-activedescendant`; `Enter` seleciona sem exigir foco físico na opção; `Escape` fecha o popover — como o foco nunca saiu do campo/editor, não há "retorno" a validar, e sim ausência de perda de foco. |
| **Menu ARIA real (`role="menu"`/`menuitem`)** | Menu do usuário na topbar ("Sair", `topbar.tsx`, confirmado por leitura do código: `aria-haspopup="menu"`, `role="menu"`/`menuitem`) | Abertura move o foco para o item "Sair" (único item hoje); `Escape` fecha o menu e devolve o foco ao botão disparador (`triggerRef`); ativar "Sair" aciona o logout. |
| **Disclosure inline (não-modal)** | Formulário de Link na toolbar do Editor (`role="group"` que alterna visibilidade); Formulário de Oferta no detalhe de Produto (`offer-section.tsx`/`offer-form.tsx`, confirmado por leitura do código: sem `autoFocus`, sem handler de `Escape`, fecha só via botão "Cancelar" ou submissão com sucesso) | Abrir não move foco automaticamente para dentro do formulário; não há fechamento por `Escape`; fecha só pelo botão "Cancelar" ou por submissão com sucesso; não exigir contenção de foco como diálogo modal. |

### 1.8 Convenção de landmarks

Múltiplos `nav`/`header`/`aside` são permitidos — não exigir landmark único por tipo. Critério real:

- Estrutura semântica coerente (cada landmark corresponde a uma região real de conteúdo, nunca decorativa).
- Quando houver mais de um landmark do mesmo tipo, cada instância tem nome acessível (`aria-label`/`aria-labelledby`) que o desambigua.
- `main` deve identificar claramente o conteúdo principal da página — é o único critério tratado como singular de fato, por ser o destino do skip link.

### 1.9 Evidência e tarefa de origem

- **Evidência/Observação**: texto livre descrevendo o que foi observado; pode referenciar screenshot/gravação armazenada fora deste documento (caminho/link).
- **Tarefa de origem**: preenchida apenas quando o resultado é FAIL, apontando a tarefa (`UXA-xxx`/`UXE-xxx`/outra) cujo critério de aceite é contradito pelo achado. Quando não for imediatamente identificável, registrar "a confirmar" em vez de adivinhar — a identificação exata é responsabilidade de quem tria o achado, não deste instrumento.

### 1.10 Cabeçalho de execução (por seção)

Cada seção (Admin — UXQ-004; FastCompre — UXQ-005) tem seu próprio cabeçalho de execução, preenchido no momento em que a verificação manual daquela seção é efetivamente realizada:

| Campo | Valor |
|---|---|
| Executor | |
| Data | |
| SHA testado (`git rev-parse HEAD`) | |
| Sistema operacional (Windows, versão) | |
| Navegador (Chrome, versão) | |
| Leitor de tela (NVDA, versão) | |
| Resultado final da seção (`Concluída` / `Em andamento — bloqueada`) | |

---
## 2. Admin — UXQ-004

### 2.0 Cabeçalho de execução — Admin (UXQ-004)

| Campo | Valor |
|---|---|
| Executor | Léo Geison |
| Data | 2026-10-16 |
| SHA testado | `f8fe625e93e5bc7c5ceda9aaae9b3c5cf507c7dd` |
| Sistema operacional | Windows 11 Pro 25H2, build 26200.9457 |
| Navegador | Chrome 155.0.8059.80 (64 bits) |
| Leitor de tela | NVDA 2026.2 |
| Resultado final | `Concluída` |

### 2.1 Pré-requisitos confirmados

- `UXA-016` — Gate de fechamento: CRUDs do Admin migrados (commit `b2251f4 test(admin): close migrated CRUD accessibility gate`) — concluída.
- `UXE-022` — Remodelagem visual do Editor de Artigos (commit `216687b feat(admin): remodel article editor`) — concluída. Pré-requisito corrigido de `UXE-016` para `UXE-022` conforme `docs/UX-Implementation-Backlog.md` (commit `63a5dc3 docs(ux): fix editorial gate dependency`), cadeia transitiva `UXE-016 → UXE-021 → UXE-022` preservada.

Observação registrada na investigação da `UXE-022`: zoom/reflow 400% e leitor de tela real no Editor permaneceram **não validados manualmente** naquela tarefa ("ainda pendente de verificação manual explícita"). Este instrumento (J9) é o que fecha essa verificação — não é um achado novo.

### 2.2 Mapa de jornadas cobertas

| Jornada | Superfície | Rota(s) real(is) | Base |
|---|---|---|---|
| J1 | Login | `/login` | `UXQ-002` (`login.a11y.spec.ts`) |
| J2 | Criar/editar Artigo | `/:siteSlug/articles/new`, `/:siteSlug/articles/:id` | `UXQ-002` (`create-edit-article.a11y.spec.ts`) |
| J3 | Publicar Artigo | `/:siteSlug/articles/:id` (`PENDING_REVIEW` → `PUBLISHED`) | `UXQ-002` (`publish-article.a11y.spec.ts`) |
| J4 | CRUD Produto | `/:siteSlug/products`, `/:siteSlug/products/:id` | `UXA-016` |
| J5 | CRUD Oferta (embutida em Produto) | `/:siteSlug/products/:id` (`offer-section.tsx`/`offer-form.tsx`) | `UXA-016` |
| J6 | CRUD Autor | `/:siteSlug/authors`, `/:siteSlug/authors/:id` | `UXA-016` |
| J7 | Dashboard populado | `/:siteSlug` | `UXA-020` |
| J8 | Shell (transversal) | sidebar/rail+drawer, topbar, command palette, skip link | `UXA-011`/`UXA-012` |
| J9 | Editor (Lexical) — interação aprofundada | dentro de `/:siteSlug/articles/:id`, toolbar/slash menu/imagem/bloco Produto | `UXE-022` |

Categoria **não** entra neste checklist (não é uma das "três CRUDs" de `UXA-016`), mesmo estando acessível pela sidebar do shell.

### 2.3 Tabelas de verificação

Legenda de categoria usada na coluna "Critério": **TEC** Teclado · **ORD** Ordem de foco · **VIS** Foco visível · **CMP** Foco conforme padrão do componente (Seção 1.7) · **TRAP** Ausência de keyboard trap · **SKL** Skip link/landmarks/headings · **NOM** Nomes acessíveis e estados anunciados · **MSG** Mensagens de erro/sucesso/saving · **RFL** Reflow/zoom 400% (Seção 1.6) · **LDT** Leitor de tela.

Colunas de cada tabela (as mesmas sete colunas em todas, sem colunas adicionais): `#` · `Critério` · `Passo de execução` · `Resultado esperado` · `PASS/FAIL/N/A` · `Evidência/Observação` · `Tarefa de origem (se FAIL)`. Nas linhas **RFL**, o viewport inicial e o zoom aplicado são registrados dentro do próprio campo `Evidência/Observação`, conforme Seção 1.6.

#### J1 — Login

Pontos de referência (mesmos 3 pontos já cobertos por axe em `UXQ-002`): `/login` vazio · erro de credencial 401 (`role="alert"`) · landing autenticado no Dashboard vazio após login mockado/real.

Nota de viewport para as linhas RFL desta jornada: registrar no campo **Evidência/Observação**, no formato `Viewport inicial: 1280 CSS px; Zoom: 400%` (padrão desta tabela) — ou os valores reais usados, com justificativa técnica para qualquer desvio (Seção 1.6).

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| J1-01 | TEC | Em `/login`, a partir da barra de endereço, pressionar `Tab` sequencialmente até alcançar o botão "Entrar", sem usar o mouse. | Todos os campos (`E-mail`, `Senha`) e o botão "Entrar" são alcançáveis em sequência, sem nenhum controle interativo pulado. | PASS |  | |
| J1-02 | ORD | Comparar a sequência de `Tab` do item anterior com a ordem visual do formulário. | Ordem de tabulação corresponde exatamente à ordem visual (E-mail → Senha → Entrar). | PASS |  | |
| J1-03 | VIS | A cada parada de `Tab`, observar o indicador de foco. | Indicador de foco visível com contraste adequado em todo elemento focado, nunca suprimido. | PASS |  | |
| J1-04 | MSG | Preencher credenciais inválidas e submeter (campo `E-mail`/`Senha`, botão "Entrar"); com NVDA ativo, não olhar a tela. | A mensagem de erro (`role="alert"`, "Credenciais inválidas.") é anunciada automaticamente pelo NVDA, sem necessidade de navegar manualmente até ela. | PASS |  | |
| J1-05 | NOM | Inspecionar a árvore de acessibilidade (DevTools) dos campos e do botão. | Nome acessível de `E-mail`, `Senha` e "Entrar" corresponde exatamente ao rótulo visível. | PASS |  | |
| J1-06 | SKL | Em `/login` (antes de autenticar), verificar se a página contém algum bloco de conteúdo repetido entre páginas (navegação, cabeçalho, rodapé) que exigiria um mecanismo de bypass. | `/login` é uma rota sem shell autenticado (`login/page.tsx` é Server Component puro, sem `nav`/sidebar/topbar) — nenhum bloco repetitivo existe nesta tela especificamente; skip link é **N/A justificado** aqui por essa ausência concreta, não pela rota ser "pública" em si. | N/A | N/A: /login não possui nenhum bloco de conteúdo repetido entre páginas (login/page.tsx é Server Component puro, sem nav/sidebar/topbar); skip link não se aplica a esta tela especificamente. | |
| J1-07 | SKL | Em `/login`, validar: (a) `<main>`/estrutura principal coerente; (b) se o propósito da página é compreensível semanticamente, não só visualmente; (c) se existir um título visual que funcione como heading da página, se ele está representado semanticamente de forma apropriada (`<h1>` ou equivalente, com o role correto). | `<main>` identifica claramente o conteúdo principal (confirmado por leitura do código: `login/page.tsx` envolve todo o conteúdo em `<main>`). O levantamento de código mostra que `login-form.tsx` não contém nenhum heading hoje — isso pode ser registrado como observação, mas **não é, isoladamente, motivo automático de FAIL**: o julgamento deve ser feito contra os critérios WCAG 2.2 AA aplicáveis (ex.: 1.3.1, 2.4.6) e a estrutura semântica realmente apresentada na renderização real, não pela simples ausência de uma tag `<h1>`. | PASS |  | |
| J1-08 | SKL | Completar login com sucesso e chegar ao Dashboard (`/:siteSlug`); a partir do topo da página, primeiro `Tab`. | Primeiro elemento focável é o skip link "Pular para o conteúdo principal"; ativá-lo move o foco para `<main>`. | PASS |  | |
| J1-09 | RFL | Em `/login`, aplicar zoom do navegador até 400% a partir da largura inicial registrada. | Formulário permanece utilizável, sem corte de conteúdo e sem scroll horizontal da página inteira. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J1-10 | RFL | Repetir no estado de erro (401) e na landing do Dashboard vazio. | Mesmo resultado esperado do item anterior nos dois estados. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J1-11 | LDT | Com NVDA ativo e a tela desligada/coberta, percorrer: abrir `/login` → preencher credenciais corretas → submeter → chegar ao Dashboard. | Cada etapa é compreensível e executável só pelo áudio, incluindo a confirmação de chegada ao Dashboard (heading "Dashboard" anunciado). | PASS |  | |

#### J2 — Criar/editar Artigo

Pontos de referência: `/articles/new` (formulário vazio) → criação (mock/real) → `/articles/:id` (formulário DRAFT populado).

Nota de viewport: toda linha **RFL** desta tabela registra, no campo **Evidência/Observação**, o formato `Viewport inicial: 1280 CSS px; Zoom: 400%` (padrão desta tabela) — ou os valores reais usados, com justificativa para qualquer desvio (Seção 1.6).

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| J2-01 | TEC | Em `/articles/new`, `Tab` sequencial pelo campo "Título" (`role="textbox"`, nome exato "Título"), "Slug" e botão "Criar". | Todos os controles alcançáveis em sequência via teclado. | PASS |  | |
| J2-02 | ORD | Comparar sequência de `Tab` com a ordem visual do formulário. | Ordem corresponde à leitura visual. | PASS |  | |
| J2-03 | VIS | A cada parada de `Tab`, observar indicador de foco. | Indicador visível em todos os controles, incluindo após o redirect para `/articles/:id`. | PASS |  | |
| J2-04 | NOM | Inspecionar nomes acessíveis de "Título", "Slug" e "Criar" nas duas telas (vazio e populado). | Nome acessível idêntico ao rótulo visível nas duas composições. | PASS |  | |
| J2-05 | MSG | Submeter o formulário com "Título"/"Slug" preenchidos; observar o redirect. | Transição para `/articles/:id` é perceptível (mudança de URL/foco/conteúdo) sem exigir que o usuário descubra isso só visualmente. | PASS |  | |
| J2-06 | SKL | Dentro do shell autenticado, validar landmarks conforme Seção 1.8 nas duas rotas. | Estrutura semântica coerente; `main` identifica claramente a área de edição do Artigo. | PASS |  | |
| J2-07 | RFL | Em `/articles/new`, aplicar zoom até 400% a partir da largura inicial registrada. | Formulário utilizável, sem corte de conteúdo; qualquer overflow observado é FAIL (Seção 1.3), mesmo que já citado como débito técnico conhecido em `UXA-019B`. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J2-08 | RFL | Repetir em `/articles/:id` (formulário DRAFT populado, incluindo a área do corpo do Artigo). | Mesmo resultado esperado do item anterior. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J2-09 | LDT | Com NVDA ativo, percorrer: abrir `/articles/new` → preencher Título/Slug → criar → chegar a `/articles/:id` populado. | Cada etapa compreensível e executável só pelo áudio, incluindo a confirmação dos valores preenchidos no formulário de edição. | PASS |  | |

> Interação aprofundada com o corpo do Artigo (toolbar, slash menu, imagem, bloco de Produto) é verificada em **J9**, não nesta tabela — `UXQ-002`/esta jornada cobrem só o formulário de metadados (Título/Slug), por decisão já registrada (escopo mínimo deliberado).

#### J3 — Publicar Artigo

Pontos de referência: `/articles/:id` em `PENDING_REVIEW` (ação "Publicar" visível) → transição (mock/real) → `PUBLISHED` (ação "Arquivar" visível).

Nota de viewport: toda linha **RFL** desta tabela registra, no campo **Evidência/Observação**, o formato `Viewport inicial: 1280 CSS px; Zoom: 400%` (padrão desta tabela) — ou os valores reais usados, com justificativa para qualquer desvio (Seção 1.6).

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| J3-01 | TEC | Em `/articles/:id` (`PENDING_REVIEW`), `Tab` até o botão "Publicar"; ativá-lo pelo teclado (`Enter`/`Space`). | Botão alcançável e ativável sem mouse. | PASS |  | |
| J3-02 | VIS | Observar indicador de foco antes e depois do clique em "Publicar". | Indicador visível mantido, inclusive após a composição re-renderizar com "Arquivar". | PASS |  | |
| J3-03 | NOM | Inspecionar nome acessível de "Publicar" e, após a transição, de "Arquivar". | Nomes correspondem exatamente aos rótulos visíveis em cada estado. | PASS |  | |
| J3-04 | MSG | Com NVDA ativo, ativar "Publicar" sem olhar a tela. | A disponibilização da nova ação ("Arquivar") e/ou qualquer indicação de sucesso da transição é perceptível pelo NVDA — verificar concretamente o que está implementado (toast/`role="status"` ou só a troca do botão) e validar se isso é suficiente para um usuário de leitor de tela perceber que a transição ocorreu. | PASS |  | |
| J3-05 | CMP | Verificar se o foco permanece no botão (agora "Arquivar", mesma posição) ou se é movido após a transição. | Documentar o comportamento real conforme a Seção 1.7 (não há overlay/diálogo neste fluxo — é re-render de botão); foco não deve ser perdido (ex.: devolvido ao `body`). | PASS |  | |
| J3-06 | RFL | Em `PENDING_REVIEW`, aplicar zoom até 400% a partir da largura inicial registrada. | Visão read-only utilizável, sem corte de conteúdo. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J3-07 | RFL | Repetir em `PUBLISHED`. | Mesmo resultado esperado do item anterior. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J3-08 | LDT | Com NVDA ativo, percorrer: abrir o Artigo em `PENDING_REVIEW` → ativar "Publicar" → confirmar `PUBLISHED`. | Fluxo compreensível e executável só pelo áudio. | PASS |  | |

#### J4 — CRUD Produto

Pontos de referência: `/:siteSlug/products` (lista) → `/:siteSlug/products/new` ou `/:siteSlug/products/:id` (form, criação/edição).

Nota de viewport: toda linha **RFL** desta tabela registra, no campo **Evidência/Observação**, o formato `Viewport inicial: 1280 CSS px; Zoom: 400%` (padrão desta tabela) — ou os valores reais usados, com justificativa para qualquer desvio (Seção 1.6).

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| J4-01 | TEC | Na lista de Produtos, `Tab` por toda a tabela/lista e pelo atalho de criação, sem mouse. | Toda linha/ação interativa alcançável via teclado. | PASS |  | |
| J4-02 | ORD | Comparar sequência de `Tab` com a ordem visual da lista e do form. | Ordem corresponde à leitura visual nas duas telas. | PASS |  | |
| J4-03 | VIS | A cada parada de `Tab`, observar indicador de foco na lista e no form. | Indicador visível em todos os controles. | PASS |  | |
| J4-04 | NOM | Inspecionar nomes acessíveis dos campos do form de Produto e das ações da lista (editar/criar). | Nome acessível corresponde ao rótulo visível. | PASS |  | |
| J4-05 | MSG | Submeter o form com um campo obrigatório vazio; depois corrigir e salvar com sucesso. | Mensagem de validação e mensagem de sucesso são anunciadas/perceptíveis sem exigir navegação manual até elas. | PASS |  | |
| J4-06 | SKL | Validar landmarks (Seção 1.8) na lista e no form de Produto. | Estrutura coerente; `main` identifica claramente a área de Produtos. | PASS |  | |
| J4-07 | RFL | Na lista de Produtos, aplicar zoom até 400% a partir da largura inicial registrada. | Lista utilizável; overflow horizontal observado é FAIL (Seção 1.3), mesmo que citado como débito técnico conhecido em `UXA-019B` para larguras estreitas — aqui o teste é em zoom real, não redução de viewport, e deve ser julgado pelo resultado observado, não pela existência prévia do registro. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J4-08 | RFL | Repetir no form de Produto. | Mesmo resultado esperado do item anterior. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J4-09 | LDT | Com NVDA ativo, percorrer: abrir lista de Produtos → criar um Produto → salvar → confirmar na lista. | Fluxo compreensível e executável só pelo áudio. | PASS |  | |

#### J5 — CRUD Oferta (embutida no detalhe de Produto)

Pontos de referência: dentro de `/:siteSlug/products/:id`, seção de Ofertas (`offer-section.tsx`) — adicionar, editar e remover uma Oferta via `offer-form.tsx`.

Nota de viewport: toda linha **RFL** desta tabela registra, no campo **Evidência/Observação**, o formato `Viewport inicial: 1280 CSS px; Zoom: 400%` (padrão desta tabela) — ou os valores reais usados, com justificativa para qualquer desvio (Seção 1.6).

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| J5-01 | TEC | Dentro do detalhe de Produto, `Tab` até a seção de Ofertas e acionar "adicionar Oferta" sem mouse. | Ação alcançável e ativável via teclado. | PASS |  | |
| J5-02 | CMP | Acionar "Nova Oferta" (ou "Editar" numa Oferta existente) via teclado. | O formulário de Oferta é revelado inline na mesma lista (disclosure, não diálogo modal — `offer-section.tsx`/`offer-form.tsx`); o foco **não** é movido automaticamente para dentro do formulário (sem `autoFocus` no código), permanecendo no controle que acionou a abertura até o usuário avançar manualmente com `Tab`. | PASS |  | |
| J5-03 | ORD/VIS | `Tab` pelos campos do formulário de Oferta (ex.: preço, marketplace, link). | Ordem de tabulação lógica; foco sempre visível. | PASS |  | |
| J5-04 | NOM | Inspecionar nomes acessíveis dos campos do formulário de Oferta e dos controles de editar/remover de cada Oferta listada. | Nome acessível corresponde ao rótulo/função visível, incluindo controles ícone-only (ex.: remover), que devem ter nome acessível apesar de não terem texto visível. | PASS |  | |
| J5-05 | MSG | Adicionar uma Oferta válida e, em seguida, remover uma Oferta existente. | Sucesso da adição/remoção é perceptível sem exigir inspeção visual (mensagem/atualização de lista anunciada). | PASS |  | |
| J5-06 | TRAP | Com o formulário de Oferta aberto, pressionar `Escape` e, em seguida, `Tab` repetidamente por toda a página. | `Escape` não tem efeito sobre o formulário (não implementado no código) — ele só fecha pelo botão "Cancelar" ou por submissão com sucesso; `Tab` nunca fica contido dentro do formulário (não é diálogo modal), avançando normalmente para o restante da página. | PASS |  | |
| J5-07 | RFL | Com a seção de Ofertas expandida/formulário aberto, aplicar zoom até 400% a partir da largura inicial registrada. | Seção utilizável, sem corte de conteúdo. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J5-08 | LDT | Com NVDA ativo, percorrer: abrir detalhe de Produto → adicionar uma Oferta → remover uma Oferta. | Fluxo compreensível e executável só pelo áudio. | PASS |  | |

#### J6 — CRUD Autor

Pontos de referência: `/:siteSlug/authors` (lista) → `/:siteSlug/authors/new` ou `/:siteSlug/authors/:id` (form, incluindo preview de avatar).

Nota de viewport: toda linha **RFL** desta tabela registra, no campo **Evidência/Observação**, o formato `Viewport inicial: 1280 CSS px; Zoom: 400%` (padrão desta tabela) — ou os valores reais usados, com justificativa para qualquer desvio (Seção 1.6).

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| J6-01 | TEC | Na lista de Autores, `Tab` por toda a lista e pelo atalho de criação, sem mouse. | Toda ação interativa alcançável via teclado. | PASS |  | |
| J6-02 | ORD/VIS | `Tab` pelos campos do form de Autor (nome, bio, avatar). | Ordem lógica; foco sempre visível. | PASS |  | |
| J6-03 | NOM | Inspecionar nome acessível dos campos e, especificamente, o `alt` da imagem de preview do avatar. | `alt` do avatar corresponde ao nome do Autor (ou indica ausência de avatar de forma não-visual, quando aplicável). | PASS |  | |
| J6-04 | MSG | Salvar o form de Autor com sucesso. | Sucesso perceptível sem exigir inspeção visual. | PASS |  | |
| J6-05 | RFL | Na lista e no form de Autor, aplicar zoom até 400% a partir da largura inicial registrada. | Telas utilizáveis, sem corte de conteúdo; overflow observado é FAIL (Seção 1.3). | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J6-06 | LDT | Com NVDA ativo, percorrer: abrir lista de Autores → criar um Autor com avatar → salvar. | Fluxo compreensível e executável só pelo áudio, incluindo a presença do avatar sendo comunicada de forma não-visual. | PASS |  | |

#### J7 — Dashboard populado

Ponto de referência: `/:siteSlug` com dado real nas três seções ("Continuar de onde parei", "Aguardando publicação", "Publicados recentemente") — `UXQ-002` só testa o estado vazio; esta jornada cobre o estado populado.

Nota de viewport: toda linha **RFL** desta tabela registra, no campo **Evidência/Observação**, o formato `Viewport inicial: 1280 CSS px; Zoom: 400%` (padrão desta tabela) — ou os valores reais usados, com justificativa para qualquer desvio (Seção 1.6).

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| J7-01 | TEC | Com as três seções populadas, `Tab` por todos os links de Artigo de cada seção e pelos atalhos de criação, sem mouse. | Todo link/ação alcançável via teclado. | PASS |  | |
| J7-02 | ORD/VIS | Comparar sequência de `Tab` com a ordem visual (seções e cards de atalho). | Ordem corresponde à leitura visual; foco sempre visível. | PASS |  | |
| J7-03 | NOM | Inspecionar nomes acessíveis dos headings `<h2>` de cada seção, dos ícones decorativos (devem ser `aria-hidden`) e dos links de Artigo. | Headings com nome correto; ícones não alteram o nome acessível da seção/link; cada link de Artigo tem nome que identifica o Artigo (não um "clique aqui" genérico). | PASS |  | |
| J7-04 | SKL | Validar landmarks (Seção 1.8) com as três seções populadas. | Estrutura coerente; `main` identifica claramente o Dashboard. | PASS |  | |
| J7-05 | RFL | Com as três seções populadas, aplicar zoom até 400% a partir da largura inicial registrada. | Dashboard utilizável, sem corte de conteúdo nas três seções e nos cards de atalho. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J7-06 | LDT | Com NVDA ativo, percorrer o Dashboard populado, seção por seção. | Cada seção e seu conteúdo são compreensíveis só pelo áudio, incluindo a distinção semântica entre "Aguardando publicação" (estado de atenção) e "Publicados recentemente". | PASS |  | |

#### J8 — Shell (transversal — validado uma vez, aplica-se a todas as jornadas acima)

Pontos de referência: sidebar/rail (≥1024px) + drawer (<1024px), topbar (seletor de Site, menu do usuário), Command Palette, skip link — presentes em toda rota autenticada.

Nota de viewport: toda linha **RFL** desta tabela registra, no campo **Evidência/Observação**, o formato `Viewport inicial: 1280 CSS px; Zoom: 400%` (padrão desta tabela) — ou os valores reais usados, com justificativa para qualquer desvio (Seção 1.6); registrar adicionalmente em qual ponto do zoom o layout cruzou o breakpoint do shell (ver J8-08).

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| J8-01 | SKL | A partir do topo de qualquer rota autenticada, primeiro `Tab`. | Primeiro elemento focável é o skip link "Pular para o conteúdo principal"; ativá-lo move o foco para `<main>`. | PASS |  | |
| J8-02 | SKL | Validar landmarks completos do shell (Seção 1.8): sidebar, topbar, área principal, e eventual `aside` do Editor. | Estrutura coerente; múltiplos `nav`/`header`/`aside`, se existirem, têm nomes acessíveis que os desambiguam; `main` identifica claramente o conteúdo principal. | PASS |  | |
| J8-03 | NOM | Inspecionar nome acessível de cada link da sidebar (Dashboard/Artigos/Produtos/Categorias/Autores) e seu `aria-current="page"` na rota ativa. | Nome acessível = texto do label, sem alteração pelos ícones decorativos; `aria-current="page"` correto por rota. | PASS |  | |
| J8-04 | TEC/CMP | Em largura <1024px, abrir o drawer mobile via teclado (ativar o trigger); observar o foco inicial; pressionar `Tab` repetidamente; depois pressionar `Escape`. | Drawer é um `<dialog>` nativo aberto via `showModal()` (Seção 1.7): foco inicial no botão de fechamento (`autoFocus`); `Tab` fica nativamente contido no conteúdo do diálogo, sem alcançar nada fora dele; `Escape` fecha nativamente (evento `cancel`) e o foco retorna automaticamente ao trigger que abriu o drawer. | PASS |  | |
| J8-05 | CMP | Abrir o menu do usuário na topbar (item "Sair") via teclado; observar o foco; pressionar `Escape`. | Menu ARIA real (`role="menu"`/`menuitem`, `aria-haspopup="menu"`, Seção 1.7): abrir move o foco para o item "Sair" (único item hoje); `Escape` fecha o menu e devolve o foco ao botão disparador da topbar. | PASS |  | |
| J8-06 | CMP | Abrir a Command Palette via teclado (atalho ou trigger) e digitar um termo de busca. | Foco permanece no campo de busca da paleta durante toda a navegação pelos resultados (`aria-activedescendant`); `ArrowUp`/`ArrowDown` navegam entre grupos "Navegar"/"Criar" sem exigir foco físico nas opções; `Enter` seleciona; `Escape` fecha. | PASS |  | |
| J8-07 | VIS | A cada parada de `Tab` no shell (sidebar, topbar, drawer, paleta), observar indicador de foco. | Indicador visível em todos os controles do shell. | PASS |  | |
| J8-08 | RFL | A partir de 1280 CSS px de largura inicial (rail/sidebar desktop visível), aplicar zoom do navegador até 400%. | O viewport CSS efetivo pode cruzar o breakpoint do shell durante o zoom — isso é esperado, não um defeito em si. O layout deve fazer reflow adequadamente, podendo substituir o rail/sidebar desktop pelo controle/drawer mobile, sem perda de conteúdo, funcionalidade ou foco, e sem exigir rolagem bidimensional indevida. **Não** é exigido que o rail permaneça visível a 400% — isso não é critério de FAIL. É FAIL: conteúdo cortado, funcionalidade perdida, foco perdido, ou necessidade de rolagem simultânea horizontal e vertical para alcançar conteúdo/controles. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J8-09 | RFL | Repetir com o drawer mobile aberto (<1024px). | Mesmo resultado esperado do item anterior. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J8-10 | LDT | Com NVDA ativo, percorrer: skip link → sidebar → abrir Command Palette → buscar e navegar para um destino → menu do usuário. | Cada etapa compreensível e executável só pelo áudio. | PASS |  | |

#### J9 — Editor (Lexical) — interação aprofundada

Pontos de referência: toolbar (`role="toolbar"`, `aria-label="Formatação do corpo do Artigo"`), slash menu (trigger `/`), inserção/resize de imagem e bloco Produto-Oferta, dentro de `/:siteSlug/articles/:id` (DRAFT, Artigo já persistido) — **exceto J9-04**, que valida especificamente o estado anterior à primeira persistência, em `/:siteSlug/articles/new` (`articleId: null`); e modo somente-leitura (`PENDING_REVIEW`/`PUBLISHED`).

Nota de viewport: toda linha **RFL** desta tabela registra, no campo **Evidência/Observação**, o formato `Viewport inicial: 1280 CSS px; Zoom: 400%` (padrão desta tabela) — ou os valores reais usados, com justificativa para qualquer desvio (Seção 1.6). Este é o ponto que a investigação da `UXE-022` registrou como "ainda pendente de verificação manual explícita" (coluna com `max-width: 720px`, WCAG 1.4.10); não tratar como presumidamente seguro.

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| J9-01 | TEC/NOM | `Tab` pela toolbar (Negrito, Itálico, Título 1/2/3, Citação, Lista, Lista numerada, Link, Imagem); inspecionar `aria-label`/`title` de cada botão. | Toda ação alcançável via teclado; nome acessível de cada botão igual ao rótulo por extenso (ex.: "Negrito", não um pictograma sem nome). | PASS |  | |
| J9-02 | NOM | Aplicar Negrito/Itálico num trecho selecionado e observar `aria-pressed`. | Estado `aria-pressed` reflete corretamente a formatação ativa no ponto do cursor. | PASS |  | |
| J9-03 | CMP/TEC | Digitar `/` no corpo do Artigo para abrir o slash menu; navegar com `ArrowUp`/`ArrowDown`; selecionar com `Enter`; depois reabrir e fechar com `Escape`. | Conforme Seção 1.7 (combobox/listbox): foco físico permanece no editor durante toda a navegação; `aria-activedescendant` indica o item ativo; `Enter` insere o bloco escolhido; `Escape` fecha sem que o foco tenha saído do editor. | PASS |  | |
| J9-04 | NOM | Em `/:siteSlug/articles/new` (antes da primeira criação — nenhum Artigo persistido ainda, `articleId: null` em `ProductLookupContext`, confirmado por leitura do código), abrir o slash menu e localizar o item "Bloco Produto-Oferta" desabilitado (`disabledReason`, `article-body-slash-menu.tsx`). | O motivo da desabilitação ("salve o Artigo antes de inserir um bloco de Produto.") é comunicado de forma não-visual (`aria-disabled` + texto do motivo sempre renderizado ao lado do item), não apenas por estilo visual de "desabilitado". | PASS |  | |
| J9-05 | TEC | Inserir uma imagem; usar os dois sliders de `width`/`height` (alternativa acessível ao arraste por ponteiro) via teclado. | Sliders operáveis integralmente via teclado (setas), com valor e unidade comunicados ao leitor de tela. | PASS |  | |
| J9-06 | LDT | Com NVDA ativo, repetir a inserção via slash menu (um bloco de texto, ex. Citação) e a navegação pela toolbar, sem olhar a tela. | Cada etapa — abertura do menu, item ativo, seleção, resultado inserido — é comunicada pelo NVDA de forma compreensível. | PASS |  | |
| J9-07 | NOM | Alcançar a visão somente-leitura (`PENDING_REVIEW`/`PUBLISHED`) e inspecionar a estrutura do corpo do Artigo. | Conteúdo somente-leitura mantém estrutura semântica (headings/listas/citação) legível por leitor de tela, mesmo sem nenhum controle de edição montado. | PASS |  | |
| J9-08 | RFL | Com o corpo do Artigo populado (texto, imagem, bloco de Produto), aplicar zoom até 400% a partir da largura inicial registrada, observando especificamente a coluna de `max-width: 720px`. | Coluna do editor e seu conteúdo permanecem legíveis e sem corte; qualquer violação aqui é **FAIL**, encerrando a pendência deixada aberta pela `UXE-022` — não presumir seguro só pela decisão de valor do breakpoint. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| J9-09 | RFL | Repetir o item anterior no painel contextual (até ~320px) e na composição completa (título/metadados/Capa/painel). | Mesmo resultado esperado do item anterior em cada região. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |

### 2.4 Histórico de achados e retestes — Admin (UXQ-004)

Preenchido só quando houver ao menos um `FAIL` nas tabelas da Seção 2.3. Cada achado gera uma linha; cada reteste (após correção na tarefa de origem) gera uma nova linha vinculada ao mesmo item.

| Item (#) | Achado (resumo) | Tarefa de origem | Status | Reteste (data/resultado) |
|---|---|---|---|---|
| | | | | |

> Nenhuma correção de código é feita dentro da `UXQ-004`. Um achado aqui é devolvido à tarefa de origem; a correção e o reteste acontecem lá, e só então a linha correspondente na Seção 2.3 muda de `FAIL` para `PASS`.

### 2.5 Fechamento — Admin (UXQ-004)

- [x] Todas as linhas das tabelas J1–J9 (Seção 2.3) estão preenchidas com `PASS` ou `N/A` justificado.
- [x] Zero `FAIL` pendente na Seção 2.4.
- [x] Cabeçalho de execução (Seção 2.0) preenchido por completo.

**Resultado final desta seção:** `Concluída` só é válido quando as três condições acima são verdadeiras. Caso contrário, o estado é `Em andamento — bloqueada`, e a tarefa não pode ser assinada como concluída, independentemente de achados já triados/em correção.

Assinatura:

```
Executor: Léo Geison
Data: 2026-10-16
Resultado final: Concluída
```

---

## 3. FastCompre — UXQ-005

> Reaproveita integralmente a **Metodologia comum (Seção 1)** já aprovada na UXQ-004 — nenhuma regra de legenda, fechamento, baseline, reflow/zoom, convenção de foco por padrão real de componente, landmarks ou evidência/tarefa de origem é redefinida aqui. Esta seção só acrescenta o que é específico do shell público e das 3 páginas do FastCompre.

### 3.0 Cabeçalho de execução — FastCompre (UXQ-005)

| Campo | Valor |
|---|---|
| Executor | Léo Geison |
| Data | 2026-10-16 |
| SHA testado | `77cad6e9025d08de0bc18a1422254c3ec54db12c` |
| Sistema operacional | Windows 11 Pro 25H2, build 26200.9457 |
| Navegador | Chrome 155.0.8059.80 (64 bits) |
| Leitor de tela | NVDA 2026.2 |
| Resultado final | `Concluída` |

### 3.1 Pré-requisitos confirmados

- `UXW-016` — Gate de fechamento UX-M04 (FastCompre Rebuilt): as 3 rotas públicas (Home, Categoria, Artigo) estão implementadas e funcionais, confirmado por leitura direta de `apps/fastcompre/src/app/(home)/page.tsx`, `[categorySlug]/page.tsx` e `[categorySlug]/[articleSlug]/page.tsx` — concluída.
- `UXQ-003` — Cenários de acessibilidade camada 2 (FastCompre): fluxo crítico público completo (Home → Categoria → Artigo → clique de afiliado) já cobre, sem violação axe, exatamente a mesma superfície desta UXQ-005 (commit `9ed5326 test(a11y): cover FastCompre public journey`, `apps/fastcompre/e2e-a11y/public-journey.a11y.spec.ts`) — concluída. O próprio doc comment desse spec confirma: "pré-requisitos UXQ-001/UXW-016, ambos já concluídos".
- Pré-requisito formal único da `UXQ-005` no backlog é `UXW-016` (`docs/UX-Implementation-Backlog.md`) — não depende da `UXQ-004` estar assinada; as duas tarefas correm em paralelo, confirmado.

### 3.2 Mapa de jornadas cobertas

| Jornada | Superfície | Rota(s) real(is) | Base |
|---|---|---|---|
| F1 | Shell (transversal) + Home | `/` — header (`site-header.tsx`/`category-nav.tsx`), footer (`site-footer.tsx`) | `UXQ-003` (`public-journey.a11y.spec.ts`) |
| F2 | Categoria | `/:categorySlug` | `UXQ-003` (`public-journey.a11y.spec.ts`) |
| F3 | Artigo + byline | `/:categorySlug/:articleSlug` | `UXQ-003` (`public-journey.a11y.spec.ts`) |
| F4 | CTA de afiliado/redirecionamento | dentro de `/:categorySlug/:articleSlug` (`product-block.tsx`/`product-offer-list.tsx`) | `UXQ-003` (`public-journey.a11y.spec.ts`) |

Critérios transversais do shell (header, footer, drawer mobile de Categorias, landmarks gerais, bypass de bloco repetido) são verificados **uma única vez em F1** — F2/F3/F4 não os repetem, só os itens específicos de cada superfície (mesmo critério já aplicado ao Shell/J8 na UXQ-004).

### 3.3 Tabelas de verificação

Legenda de categoria: mesma da Seção 2.3 (**TEC/ORD/VIS/CMP/TRAP/SKL/NOM/MSG/RFL/LDT**), não redefinida aqui. Mesmas sete colunas, mesma convenção de registro de viewport/zoom no campo **Evidência/Observação** (Seção 1.6).

#### F1 — Shell (transversal) + Home

Pontos de referência: `/` (estado populado, mesma fixture de `UXQ-003`) — header (wordmark "FastCompre" + nav de Categorias persistente `sm+`/drawer `<sm`), hero + grade de Artigos, paginação (quando houver mais de uma página), footer (wordmark, nav "Categorias no rodapé", disclosure, copyright).

Achado de código fechado antes da escrita deste checklist: **não existe skip link explícito no shell público** (confirmado por leitura de `layout.tsx` e `site-header.tsx` — nenhum mecanismo de bypass textual, diferente do Admin). O item F1-04 reflete isso como comportamento esperado real (bypass via navegação por landmarks), não como uma lacuna a ser corrigida nesta tarefa.

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| F1-01 | TEC | A partir do topo de `/`, `Tab` sequencialmente pelo Header (link "FastCompre", depois os links de Categoria da navegação persistente, viewport ≥640px), pelo conteúdo da Home (link do hero, links dos cards, controles de paginação) e pelo Footer (link "FastCompre", links de Categoria do rodapé), sem usar o mouse. | Todo controle interativo é alcançável em sequência via teclado, sem nenhum pulado. | PASS |  | |
| F1-02 | ORD/VIS | Comparar a sequência de `Tab` do item anterior com a ordem visual (Header → Home → Footer); observar o indicador de foco a cada parada. | Ordem de tabulação corresponde à ordem visual; indicador de foco visível com contraste adequado em todo elemento focado, nunca suprimido. | PASS |  | |
| F1-03 | CMP | Em largura <640px, abrir o drawer mobile de Categorias via teclado (ativar o trigger `aria-label="Categorias"`); observar o foco inicial; pressionar `Tab` repetidamente; depois pressionar `Escape`. | Drawer é um `<dialog>` nativo aberto via `showModal()` — mesmo mecanismo já validado no Admin (Seção 1.7, `<dialog>` + `showModal()`), confirmado por leitura de `category-nav.tsx`: foco inicial no botão "Fechar" (`autoFocus`); `Tab` fica nativamente contido no conteúdo do diálogo, sem alcançar nada fora dele; `Escape` fecha nativamente (evento `cancel`) e o foco retorna automaticamente ao trigger que abriu o drawer. Fechamento por clique no backdrop **não** é esperado (deliberadamente não implementado, decisão fechada da UXW-004) — isso não é FAIL. | PASS |  | |
| F1-04 | SKL | Com NVDA ativo (ou navegação por landmarks via teclado), verificar se é possível alcançar `<main>` sem percorrer every controle do Header via `Tab`. | Não existe skip link explícito neste shell (confirmado por leitura do código) — o mecanismo de bypass real é a navegação por landmarks: `<header>`, `<nav aria-label="Categorias">`, `<main>` e `<footer>` são landmarks reais e nomeados, diretamente alcançáveis pela navegação por landmarks do leitor de tela (ex.: tecla `d` do NVDA). Isso é o comportamento esperado — ausência de skip link não é, por si só, FAIL. | PASS |  | |
| F1-05 | NOM | Inspecionar nomes acessíveis: link "FastCompre" (Header e Footer), itens de Categoria (nav persistente, drawer e rodapé), link do hero (`aria-labelledby` para o título do Artigo), links dos cards de Artigo (`aria-labelledby`), trigger do drawer (`aria-label="Categorias"`). | Nome acessível de cada controle corresponde ao título real do Artigo/nome da Categoria ou ao rótulo visível — nenhum nome genérico ("clique aqui"/sem nome). | PASS |  | |
| F1-06 | MSG | Inspecionar o H1 da Home ("FastCompre") e o estado da página atual nos controles de paginação (quando houver mais de uma página). | H1 único por página (Architecture.md §33); página atual da paginação é um `<span aria-current="page">`, nunca um link para si mesma — nome acessível (`Página N de M`) distinto dos demais itens (`Ir para a página N`). | PASS |  | |
| F1-07 | RFL | A partir de 1280 CSS px de largura inicial (nav persistente de Categorias visível), aplicar zoom do navegador até 400%. | O viewport CSS efetivo pode cruzar o breakpoint `640px` do shell durante o zoom — isso é esperado, não um defeito em si; o layout substitui a nav persistente pelo trigger do drawer sem perda de conteúdo, funcionalidade ou foco, e sem exigir rolagem bidimensional. É FAIL: conteúdo cortado, funcionalidade perdida, foco perdido, ou rolagem simultânea horizontal e vertical. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| F1-08 | RFL | Repetir com o drawer mobile aberto (<640px). | Mesmo resultado esperado do item anterior. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| F1-09 | LDT | Com NVDA ativo, percorrer: abrir `/` → Header (wordmark, nav de Categorias) → H1 "FastCompre" → hero → cards → paginação (se houver) → Footer (Categorias, disclosure, copyright). | Cada etapa é compreensível e executável só pelo áudio, incluindo a distinção entre os dois landmarks "Categorias" (Header) e "Categorias no rodapé" (Footer). | PASS |  | |

#### F2 — Categoria

Pontos de referência: `/:categorySlug` (estado populado), alcançada por navegação real a partir do link de Categoria do Header (nunca `page.goto()`, mesmo precedente de `UXQ-003`). Critérios transversais do shell já verificados em **F1** não são repetidos aqui.

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| F2-01 | TEC/ORD/VIS | Em `/:categorySlug`, `Tab` pelos cards de Artigo e pelos controles de paginação (quando houver mais de uma página), sem mouse; comparar com a ordem visual; observar o indicador de foco a cada parada. | Todo link/controle alcançável via teclado, na ordem visual, com foco sempre visível. | PASS |  | |
| F2-02 | NOM | Inspecionar o H1 (nome da Categoria) e os nomes acessíveis dos links de card (`aria-labelledby` para o título do Artigo). | H1 corresponde exatamente ao nome real da Categoria; nome acessível de cada card corresponde ao título do Artigo, nunca genérico. | PASS |  | |
| F2-03 | RFL | Em `/:categorySlug`, aplicar zoom do navegador até 400% a partir da largura inicial registrada (1280 CSS px). | Grade de Artigos e paginação permanecem utilizáveis, sem corte de conteúdo e sem rolagem horizontal da página inteira. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| F2-04 | LDT | Com NVDA ativo, percorrer: chegar a `/:categorySlug` (via link de Categoria do Header, não `page.goto()`) → H1 (nome da Categoria) → cards de Artigo → paginação (se houver). | Cada etapa é compreensível e executável só pelo áudio, incluindo a confirmação do nome da Categoria alcançada. | PASS |  | |

#### F3 — Artigo + byline

Pontos de referência: `/:categorySlug/:articleSlug` (estado populado), alcançado por navegação real a partir do link do card de Artigo na Categoria (nunca `page.goto()`, mesmo precedente de `UXQ-003`). Critérios transversais do shell já verificados em **F1** não são repetidos aqui.

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| F3-01 | TEC/ORD/VIS | Em `/:categorySlug/:articleSlug`, `Tab` pelos links inline do corpo MDX (quando houver) e pelos CTAs de Oferta (bloco de Produto inline e seção estática "Produtos" ao final), sem mouse; comparar com a ordem visual (de cima para baixo); observar o indicador de foco a cada parada. | Todo controle interativo (links do corpo, CTAs de Oferta) alcançável via teclado, na ordem visual, com foco sempre visível. | PASS |  | |
| F3-02 | NOM | Inspecionar: H1 (título do Artigo); byline — avatar real (`alt=""`) ou iniciais de fallback (`aria-hidden="true"`), nome do Autor sempre como texto visível ao lado; headings do corpo MDX (escala H2–H6 remapeada, Architecture.md §33); heading "Produtos" da seção estática. | Avatar/iniciais da byline são puramente decorativos (nunca duplicam o nome no leitor de tela); nome do Autor sempre anunciado uma única vez; hierarquia de headings coerente (nenhum segundo H1 na página). | PASS |  | |
| F3-03 | MSG | Em um Artigo sem Autor vinculado (`article.author` nulo), verificar a byline. | A byline inteira é omitida (nenhum elemento vazio/quebrado renderizado) — comportamento condicional, nunca um fallback visual sem dado real. Marcar N/A se a fixture executada não cobrir um Artigo sem Autor. | PASS |  | |
| F3-04 | RFL | Em `/:categorySlug/:articleSlug`, aplicar zoom até 400% a partir da largura inicial registrada (1280 CSS px), observando especificamente a byline, a capa e o wrapper interno do corpo (`max-w-3xl`). | Título, byline, capa, corpo de texto e seção "Produtos" permanecem legíveis e utilizáveis, sem corte de conteúdo e sem rolagem horizontal. | PASS | Viewport inicial: 1280 CSS px; Zoom: 400%. | |
| F3-05 | LDT | Com NVDA ativo, percorrer: chegar ao Artigo (via link de card na Categoria, não `page.goto()`) → H1 → data → byline → corpo MDX → seção "Produtos". | Cada etapa é compreensível e executável só pelo áudio, incluindo a distinção entre o nome do Autor (texto sempre visível) e o avatar/iniciais (decorativos). | PASS |  | |

#### F4 — CTA de afiliado / redirecionamento

Pontos de referência: CTAs de Oferta dentro do Artigo (bloco de Produto inline, `product-block.tsx`, e seção estática "Produtos", `page.tsx`) — ambos reutilizam exatamente o mesmo `ProductOfferList` (`product-offer-list.tsx`), confirmado por leitura do código: nenhum padrão de foco distinto entre os dois pontos de renderização.

| # | Critério | Passo de execução | Resultado esperado | PASS/FAIL/N/A | Evidência/Observação | Tarefa de origem (se FAIL) |
|---|---|---|---|---|---|---|
| F4-01 | TEC | Localizar um CTA de Oferta em estoque (bloco de Produto inline ou seção estática "Produtos") via `Tab`; ativá-lo pelo teclado (`Enter`), sem mouse. | CTA alcançável e ativável sem mouse, com o mesmo comportamento em ambos os pontos de renderização (`ProductOfferList` compartilhado). | PASS |  | |
| F4-02 | NOM | Inspecionar o nome acessível do CTA e o texto de uma Oferta fora de estoque. | Nome acessível do CTA = `{Marketplace} — {Preço formatado}` seguido de um trecho `sr-only` "(abre em nova aba)"; Oferta fora de estoque é texto simples, nunca um link/controle interativo. | PASS |  | |
| F4-03 | CMP | Ativar o CTA (teclado ou mouse) e observar o comportamento resultante. | O `<a>` é um link real (`target="_blank"`, `rel="sponsored nofollow noopener noreferrer"`), sem handler/JS controlando a navegação (Server Component puro, sem `onClick`) — abre uma nova aba/guia para a cadeia de redirecionamento (`GET /r/:siteSlug/:offerId?articleId=...`); foco e composição da página de origem (Artigo) não são alterados pela abertura da nova aba. | PASS |  | |
| F4-04 | LDT | Com NVDA ativo, localizar um CTA de Oferta em estoque e uma Oferta fora de estoque, sem olhar a tela. | O CTA é anunciado com o rótulo do marketplace, o preço e a indicação "(abre em nova aba)" antes da ativação; a Oferta fora de estoque é anunciada como texto comum, nunca como um controle inoperante. | PASS |  | |

### 3.4 Histórico de achados e retestes — FastCompre (UXQ-005)

Preenchido só quando houver ao menos um `FAIL` nas tabelas da Seção 3.3. Cada achado gera uma linha; cada reteste (após correção na tarefa de origem) gera uma nova linha vinculada ao mesmo item.

| Item (#) | Achado (resumo) | Tarefa de origem | Status | Reteste (data/resultado) |
|---|---|---|---|---|
| | | | | |

> Nenhuma correção de código é feita dentro da `UXQ-005`. Um achado aqui é devolvido à tarefa de origem; a correção e o reteste acontecem lá, e só então a linha correspondente na Seção 3.3 muda de `FAIL` para `PASS`.

### 3.5 Fechamento — FastCompre (UXQ-005)

- [x] Todas as linhas das tabelas F1–F4 (Seção 3.3) estão preenchidas com `PASS` ou `N/A` justificado.
- [x] Zero `FAIL` pendente na Seção 3.4.
- [x] Cabeçalho de execução (Seção 3.0) preenchido por completo.

**Resultado final desta seção:** `Concluída` só é válido quando as três condições acima são verdadeiras. Caso contrário, o estado é `Em andamento — bloqueada`, e a tarefa não pode ser assinada como concluída, independentemente de achados já triados/em correção.

Assinatura:

```
Executor: Léo Geison
Data: 2026-10-16
Resultado final: Concluída
```
