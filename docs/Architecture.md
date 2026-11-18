# Architecture.md — Commerce Platform / FastCompre MVP

> Documento oficial de arquitetura. Consolida todas as decisões aprovadas nas Etapas 1 a 15 do processo de projeto. Não contém backlog, tarefas ou cronograma — isso está em `Implementation-Backlog.md`. Este documento responde: **como esta plataforma foi projetada?**

---

## 1. Visão Geral do Projeto

O Commerce Platform é uma plataforma multi-marca de conteúdo e afiliação, construída como um monorepo reutilizável. A primeira marca a ser lançada é o **FastCompre** (fastcompre.com), voltado ao público brasileiro, cobrindo produtos físicos, comparações, reviews e ofertas. A segunda marca prevista é o **QuickDealDay** (quickdealday.com), voltado ao público internacional, cobrindo software, IA, SaaS e ferramentas digitais.

O site público (FastCompre) publica artigos de comparação e review que referenciam produtos com links de afiliado. Quando um visitante clica num link e compra no marketplace, a plataforma recebe comissão. O motor de curadoria/publicação por trás do FastCompre é desenhado desde o início como uma plataforma multi-marca (multi-tenant), para que o QuickDealDay e futuros produtos SaaS possam reutilizar a mesma base técnica.

## 2. Missão

Ajudar o consumidor brasileiro a decidir com confiança qual produto comprar, através de comparações claras e honestas — gerando receita por comissão de afiliado sem comprometer a qualidade ou a isonomia da recomendação.

## 3. Objetivos

- Validar, com o menor conjunto de funcionalidades possível, que é viável publicar conteúdo comparativo de qualidade suficiente para indexar no Google e gerar cliques de afiliado.
- Construir a base técnica (motor de curadoria/publicação) de forma reutilizável, para suportar múltiplas marcas no mesmo monorepo sem duplicar trabalho.
- Preparar o terreno para, no médio/longo prazo, transformar o próprio motor num produto SaaS vendido a outros operadores de afiliados.

### Visão de longo prazo

O Commerce Platform nasce como um site de afiliados (FastCompre), mas o objetivo de longo prazo é ser um motor reutilizável de curadoria e publicação de conteúdo comercial, operando múltiplas marcas (FastCompre, QuickDealDay e futuras) sobre a mesma base técnica. Em estágio maduro, esse motor pode virar produto em si — vendido como SaaS para outros operadores de afiliados que enfrentam o mesmo gargalo de produção de conteúdo em escala. A validação dessa visão de longo prazo depende inteiramente do sucesso do primeiro site (FastCompre); nada é construído antecipando esse futuro às custas do presente.

## 4. Público-Alvo e Personas

**Visitante**
1. **Comparador racional** — já decidiu a categoria (ex: "quero um fone bluetooth"), mas está indeciso entre 2-3 modelos. Busca "X vs Y" ou "melhor X até R$300". É o público-alvo principal do MVP.
2. **Caçador de oferta** — sabe exatamente o que quer, só está procurando o menor preço/melhor condição no momento. Busca "onde comprar X mais barato".

**Administrador**
1. **Editor/dono** — cadastra produto, escreve/revisa artigo, publica, acompanha cliques. Único usuário real no MVP.
2. **Futuro editor contratado** — perfil que só deveria poder criar/editar conteúdo, sem acesso a configurações da plataforma (justifica o `Role` já existir no MVP mesmo com um único usuário real).

### Casos de uso por tipo de usuário

**Visitante:** busca no Google → chega numa página de artigo → lê comparativo → clica em produto → é redirecionado ao marketplace. Navega de um artigo para outro relacionado via link interno.

**Administrador:** cadastra um produto novo → vincula uma ou mais ofertas (marketplace + preço + link de afiliado) → escreve um artigo referenciando um ou mais produtos → move o artigo por rascunho → em revisão → publicado → consulta quantos cliques cada artigo/produto gerou.

## 5. Escopo do MVP

### Funcionalidades obrigatórias

- Autenticação simples do admin.
- CRUD de Produto (nome, categoria, imagem, descrição).
- CRUD de Oferta (marketplace, preço, link de afiliado, disponibilidade).
- CRUD de Categoria.
- CRUD de Artigo (título, corpo, produtos referenciados) com os três status: rascunho → em revisão → publicado.
- Página pública do artigo (SSR/SSG) com SEO mínimo.
- Registro de clique em link de afiliado.
- Sitemap.xml e robots.txt gerados a partir dos artigos publicados.
- Upload de imagem para Produtos e imagem de capa para Artigos.
- Artigo contempla desde o início: slug, meta title, meta description, imagem de capa, corpo do conteúdo.

### Critério de sucesso do MVP

Não é receita ainda (fora do controle direto no curto prazo). O critério é operacional: conseguir publicar um artigo do início ao fim sem fricção técnica, e o clique de afiliado sendo registrado corretamente. Se isso funciona para 5-10 artigos, o MVP cumpriu seu papel.

## 6. Fora do MVP

- Geração de conteúdo por IA (o fluxo manual de criação/revisão/publicação precisa provar que funciona primeiro; IA nunca publica sozinha).
- Histórico de preço.
- Dashboard de analytics (consulta direta ao banco é suficiente).
- Busca interna/textual (em nenhuma listagem).
- Tags e vínculo `ArticleTag`.
- E-mail/notificação.
- Ingestão automática via API de marketplace (cadastro manual de Produto/Oferta no MVP).
- Entidade `Media` (upload vira campo de URL direto).
- Gestão de membros do Site (convite, alteração, remoção de `SiteUser`) — Role existe para autorização, mas sem endpoint de gestão.
- Criação/administração de Sites via API — só via bootstrap transacional.
- QuickDealDay e o painel multi-projeto (entram depois que o FastCompre estiver validado).
- Fila, outbox, retry persistente ou flag no banco para revalidação.
- Turborepo (sem decisão explícita de adotar).

## 7. Princípios Arquiteturais

- **Isolamento por site é inegociável** — nenhuma query, endpoint ou componente pode misturar dados entre marcas, mesmo quando só existe uma marca ativa.
- **Nada de abstração especulativa** — um código só é generalizado (vira package/módulo compartilhado) depois de existir em pelo menos dois usos reais, nunca antes.
- **Humano no controle da publicação** — IA gera, nunca publica; toda automação futura entra por cima de um fluxo manual que já funciona.
- **Simplicidade antes de escala** — a arquitetura permite crescer, mas o MVP implementa o mínimo necessário para validar a tese de negócio, não o desenho final da plataforma.
- **Decisão documentada > decisão memorizada** — toda escolha relevante (stack, modelagem, trade-off) fica registrada.
- Engenharia segue **SOLID**, composição sobre herança, **DDD** onde apropriado, tipagem forte; evita god classes, código duplicado e otimização prematura.
- Fluxo de trabalho antes de codar: entender o problema → explicar opções → discutir trade-offs → desenhar arquitetura → banco → API → UI → estrutura de pastas → só então código.
- Toda decisão vem acompanhada de justificativa e trade-offs; quando há mais de uma alternativa válida, as opções são apresentadas antes da escolha; nenhuma decisão importante é presumida sem explicação.

### Princípios editoriais

- Recomendação honesta acima de comissão maior — nunca priorizar um produto no comparativo só porque a comissão de afiliado é melhor.
- Transparência de afiliação sempre visível — todo artigo declara que contém links de afiliado.
- Conteúdo revisado antes de publicado — nenhum artigo (manual ou gerado por IA) vai ao ar sem revisão humana.
- Dado verificável, não inventado — preço, especificação e disponibilidade vêm da Oferta cadastrada, nunca de estimativa da IA.
- Atualização como responsabilidade editorial — um artigo com oferta desatualizada/fora de estoque é considerado defeituoso, não apenas "desatualizado".

### Definition of Done (funcionalidade)

Uma funcionalidade só é considerada concluída quando: o código está implementado e revisado; respeita o isolamento por `siteId` sempre que a entidade for específica de marca; foi testada manualmente com resultado igual ao esperado; não introduz publicação automática sem revisão humana, quando aplicável; está documentada o suficiente para ser entendida sem reler o histórico da conversa; tem sugestão de commit correspondente; foi validada pelo usuário antes de prosseguir.

## 8. KPIs do MVP

**Saúde do conteúdo:** número de artigos publicados por semana; número de produtos com pelo menos uma oferta válida.

**Resultado (o que valida a tese):** número de páginas indexadas pelo Google; cliques em link de afiliado por artigo; taxa de clique (cliques ÷ visitas); receita de comissão total no mês.

O KPI que mais importa nos primeiros 60-90 dias é indexação + clique — receita ainda deve ser baixa/irregular nesse período.

## 9. Requisitos Não Funcionais

- **Performance:** páginas de artigo devem passar nos Core Web Vitals do Google (fator de ranqueamento).
- **Disponibilidade:** site consistentemente no ar — indisponibilidade intermitente prejudica indexação e confiança do Google.
- **Segurança básica:** painel administrativo protegido por autenticação; nenhuma rota de escrita exposta publicamente.
- **Isolamento por site:** toda entidade de marca respeita `siteId`; nenhuma consulta pode vazar conteúdo de um site para outro.
- **Manutenibilidade:** código específico de negócio não se mistura com o que é genérico, mesmo antes de existirem packages físicos.
- **Rastreabilidade:** todo clique de afiliado é registrado de forma auditável (artigo, oferta, quando).

## 10. Riscos Identificados

**Técnicos:** domínio parado há 2 anos pode ter perdido autoridade/indexação; dependência de terceiros (mudança de política/API de Mercado Livre/Amazon); sem IA no início, o gargalo de produção de conteúdo é 100% manual.

**De negócio:** nicho de afiliados é competitivo; receita depende quase 100% de busca orgânica no MVP (risco de atualização de algoritmo do Google); hiato de caixa de 2-4 meses até o SEO gerar volume; fator "ônibus" — um único operador de conteúdo/cadastro/revisão.

**Técnico de schema:** Prisma possui uma limitação documentada (issue `prisma/prisma#6042`, aparentemente ainda não resolvida) que pode rejeitar relações compostas que misturam campo opcional com campo obrigatório quando a relação em si é opcional — afeta `Product.category`, `Article.category`, `Article.author` e `AffiliateClick.article` como modelados. Só será confirmado ao rodar `prisma validate` num ambiente real, na primeira atividade da fase de implementação.

## 11. Glossário do Domínio

| Termo | Definição |
|---|---|
| **Site** | Uma marca/propriedade dentro da plataforma (ex: FastCompre). Unidade de isolamento multi-tenant. |
| **Produto** | Entidade editorial de um item — nome, categoria, imagem, descrição base. Independe de onde é vendido. |
| **Oferta** | Instância comercial de um Produto num marketplace específico: preço, link de afiliado, disponibilidade. Um Produto pode ter várias Ofertas. |
| **Artigo** | Conteúdo publicável (review, comparativo, guia de compra, deal) que referencia um ou mais Produtos. |
| **Rascunho de IA (AIDraft)** | Conceito fora do MVP — saída bruta gerada por IA, ainda não aprovada; nunca visível publicamente quando existir. |
| **Aprovação** | Ato humano que transforma um texto manual (ou, no futuro, um rascunho de IA) em Artigo publicável. |
| **Clique de afiliado** | Evento registrado quando um visitante clica no link de uma Oferta a partir de um Artigo. |
| **Marketplace** | Fonte comercial de uma Oferta (Mercado Livre, Amazon, etc.) — conceito separado de como o registro entrou no sistema. |
| **TenantContext** | Objeto imutável explícito `{ siteId, siteSlug }`, resolvido de forma confiável e passado por parâmetro a todo caso de uso — nunca lido de estado global. |

---

## 12. Regras de Negócio

### Produto
- Pode existir sem nenhuma Oferta (estado válido, mas não publicável em artigo).
- Pertence a exatamente um `Site` — não é compartilhado entre marcas, mesmo representando o "mesmo item" fisicamente.
- Slug único por `Site`.
- Vinculado a um Artigo publicado não pode ser excluído fisicamente, apenas arquivado/desativado.
- Produto arquivado não pode ser vinculado a novos Artigos; Artigos existentes preservam a referência e o histórico.
- Exclusão física só é permitida para Produtos sem vínculos (Oferta) e sem vínculo com Artigo.
- Um Produto sem Oferta pode ser vinculado a um Artigo em rascunho/revisão — o bloqueio de publicação só ocorre no momento de publicar.

### Oferta
- Toda Oferta exige um link de afiliado válido para ser salva — "válido" no MVP significa URL obrigatória, com formato válido e protocolo HTTP ou HTTPS, sem verificação externa automática.
- Um Produto pode ter múltiplas Ofertas, inclusive do mesmo marketplace.
- Oferta indisponível (`inStock = false`) permanece visível, com destaque visual reduzido frente às disponíveis.
- Não existe "oferta oficial/principal" no MVP.
- Oferta com clique registrado, ou vinculada a Produto usado em Artigo publicado, deve ser arquivada, nunca removida — preservando histórico; removê-la/arquivá-la nunca despublica o Artigo.
- "Oferta válida" (para fins de publicação) = ativa (não arquivada), em estoque, com URL válida.
- Preço deve ser um valor positivo (`> 0`), reforçado com `CHECK` no banco.

### Categoria
- Categoria com Produto ou Artigo vinculado não pode ser excluída; exclusão física só é permitida quando estiver vazia.
- Torna-se obrigatória apenas no momento da publicação de um Artigo (durante o rascunho, `categoryId` permanece opcional).

### Artigo
- Pertence a exatamente um `Site`; slug único por `Site`.
- Pode referenciar um ou mais Produtos; a obrigatoriedade de ao menos um Produto é regra do MVP para os tipos review/comparativo/guia/deal, não necessariamente permanente para futuros tipos editoriais.
- Regras de bloqueio de publicação: status `PENDING_REVIEW`; Categoria ativa; ao menos um Produto vinculado; cada Produto referenciado com Oferta válida; slug único; `metaDescription` preenchida; imagem de capa presente.
- Se, após publicado, um Produto referenciado perder todas as Ofertas válidas, o Artigo **não** é despublicado automaticamente — fica sinalizado como pendente ao admin, e a página pública informa "temporariamente indisponível" (preserva SEO e histórico de URL). "Pendente" não é um status persistido — é calculado por um read model (`/health`), nunca armazenado.
- Edição de Artigo publicado não é direta — é bloqueada; para editar, o fluxo exige `PUBLISHED → ARCHIVED → DRAFT → editar → PENDING_REVIEW → PUBLISHED` novamente. Um Artigo em `PENDING_REVIEW` também não pode ser editado diretamente — exige `PENDING_REVIEW → DRAFT → editar → PENDING_REVIEW`. Somente `DRAFT` é editável.
- Sempre que um Artigo publicado é editado (dentro do fluxo acima), `updatedAt` é atualizado e exibido publicamente como "última atualização".
- Vincular/desvincular/reordenar Produto num Artigo só é permitido em `DRAFT`.

### Isolamento multi-tenant
- Toda consulta envolvendo Produto, Oferta, Artigo, Categoria ou Clique deve ser filtrada por `siteId` — regra de negócio, não apenas de implementação, pois uma falha aqui expõe conteúdo de uma marca na outra.

### Tracking
- Todo clique em link de afiliado gera um registro de `AffiliateClick`, associado a `Site`, Oferta e, quando aplicável, ao Artigo de origem.
- Metadados (`referer`, `user-agent`, UTM) são armazenados quando disponíveis, mas nenhum é obrigatório para o registro do clique.
- Nenhum dado de clique é pessoalmente identificável (sem IP, sem cookie de rastreamento individualizado no MVP).
- `referer`/`user-agent` são tratados como telemetria não confiável, nunca usados em decisão de autorização/roteamento.

---

## 13. Decisões Arquiteturais

### Stack tecnológica

- **Frontend:** Next.js, React, TypeScript, TailwindCSS, shadcn/ui.
- **Backend:** NestJS, Prisma, PostgreSQL.
- **Infraestrutura:** Docker, GitHub Actions, Vercel, Railway, Redis, BullMQ, Cloudflare R2 (uso de infraestrutura de fila/cache reservado para necessidades futuras — não presente no MVP).
- **Autenticação:** sessão opaca própria (ver Seção 15) — Better Auth foi avaliado e adiado (integração com NestJS é mantida pela comunidade, não justificada ainda para os requisitos atuais).
- **E-mail:** Resend (reservado para uso futuro — fora do MVP).

### Opções de arquitetura consideradas (acesso Next.js ↔ banco)

Três opções foram avaliadas:

- **Opção A — separação total:** Next.js consome a API NestJS via HTTP para tudo, inclusive leitura pública.
- **Opção B — sem NestJS no MVP:** Next.js único fazendo tudo (público + admin) direto com Prisma.
- **Opção C — híbrida:** leitura pública direto do banco via Server Components; escrita/admin via NestJS.

**Decisão final:** uma versão pragmática da **Opção A** — nenhum app Next.js acessa o Prisma diretamente; a API é o único ponto de acesso ao banco. A Opção C foi descartada porque, para manter dois caminhos de acesso consistentes, exigiria criar antecipadamente os próprios packages compartilhados de banco/domínio que o princípio "nada de abstração especulativa" pede para não antecipar — além de introduzir risco de divergência de filtros por `siteId`, duplicação de regras de leitura e exposição de campos internos.

Para não sacrificar performance/SEO com essa decisão, o site público usa **geração estática, cache e revalidação** (a API é consultada na geração/revalidação da página, não em cada acesso do visitante) — ver Seção 20 (Fluxo de Revalidação).

### Justificativa dos três apps separados

`apps/fastcompre`, `apps/admin` e `apps/api` são mantidos como aplicações separadas não apenas por segurança (rotas administrativas poderiam, em tese, ser protegidas mesmo dentro do mesmo Next.js), mas porque têm **preocupações muito diferentes**:
- `fastcompre`: orientado a SEO, geração estática, cache, revalidação, desempenho público.
- `admin`: orientado a autenticação, formulários, editor de conteúdo, upload, permissões, operações de escrita.
- `api`: único ponto de acesso ao Prisma/PostgreSQL, autoridade única sobre regras de negócio, autenticação, autorização, tenancy, publicação, tracking e redirecionamento.

Fronteiras adicionais: nenhum app Next.js acessa Prisma diretamente; o admin nunca decide sozinho se uma publicação é válida — a API sempre revalida as regras; o site público só consome endpoints públicos e nunca aceita `siteId` arbitrário do visitante; a API resolve o contexto de Site de forma confiável no servidor; **a separação física dos apps não substitui autenticação e autorização**.

---

## 14. Bounded Contexts / Domínios

A separação lógica final, aplicada como fronteiras de responsabilidade dentro do app único do MVP (não como packages físicos separados):

- **Tenancy / Site Context** — `Site` e o isolamento multi-tenant. Eixo transversal que atravessa todos os outros domínios.
- **Identity & Access** — `User`, `Session`, `SiteUser`, `Role`, autenticação e autorização.
- **Catalog** — `Category`, `Product`, `Offer`. Não depende diretamente de Editorial.
- **Editorial** — `Article`, `Author` (com relação opcional a `User`), SEO, fluxo de publicação.
- **Tracking** — `AffiliateClick` e seus metadados. Só recebe IDs/dados já validados — não conhece a lógica interna de Catalog/Editorial.
- **Application** — orquestração dos casos de uso que cruzam fronteiras de domínio: publicar Artigo, excluir/arquivar Produto e Categoria, calcular saúde operacional do Artigo, registrar clique e redirecionar.

### Por que uma camada de Application, e não uma cadeia rígida de dependências

A primeira proposta de separação de domínios tinha Catalog dependendo indiretamente de Editorial para decidir exclusão de Produto — o que violava a regra de que Catalog não deve depender de Editorial. A solução foi introduzir **Application como camada de coordenação**: decisões que cruzam fronteiras (excluir/arquivar Produto ou Categoria, publicar Artigo, calcular saúde, registrar clique e redirecionar, coordenar revalidação) são orquestradas por casos de uso de Application, que consultam os domínios envolvidos — nenhum domínio acessa outro diretamente para esconder essa orquestração.

`Author` foi deliberadamente colocado em Editorial, não em Identity & Access — é uma persona editorial (nome, bio, avatar), não uma credencial de acesso; mantém apenas uma relação opcional com `User`.

---

## 15. Autenticação

### Estratégia

Sessão opaca persistida no banco, não JWT/access+refresh token. Fluxo:
1. A API valida e-mail e senha.
2. Gera um token de sessão aleatório.
3. Armazena **somente o hash** desse token no banco (nunca o valor bruto).
4. Envia o token bruto em cookie `HttpOnly`.
5. Em cada requisição autenticada, valida a sessão e resolve `User`, `SiteUser` e `Role`.
6. Logout revoga a sessão no banco e remove o cookie.

**Justificativa:** com poucos usuários administrativos no MVP, a complexidade que uma lib como Better Auth ou um serviço externo (Clerk/Auth0/WorkOS) economizariam é pequena, e ambas trazem uma dependência que não se paga ainda. Sessão opaca também simplifica revogação, logout, alteração de Role e remoção de acesso ao Site, sem exigir rotação de refresh token ou lista de revogação de JWT — algo que JWT dificulta.

Passport pode ser utilizado apenas se simplificar concretamente a integração com Guards, mas não é tratado como responsável pelo ciclo completo da sessão.

### Configuração do cookie (produção)

`HttpOnly`; `Secure`; `SameSite=Lax` inicialmente; `Path=/`; duração limitada; **host-only** em `api.fastcompre.com` (sem `Domain=.fastcompre.com`, já que o admin não precisa ler ou possuir diretamente o cookie da API). O admin faz requisições à API usando credenciais habilitadas (`credentials: include`), e a API permite somente a origem exata do painel via CORS.

### Proteções contra CSRF

`SameSite`; CORS restrito à origem exata do admin; validação de `Origin`/`Referer` em requisições de escrita; estratégia de token CSRF caso necessária; nenhuma rota mutável baseada apenas na presença do cookie.

### Requisitos obrigatórios

Hash seguro de senha; rate limiting no login (e no redirect de tracking); mensagem genérica para credenciais incorretas (não revela se o erro foi e-mail ou senha); expiração e revogação de sessão; logout real; e-mails sempre normalizados para minúsculas antes de salvar/consultar (evita duplicidade lógica por diferença de capitalização).

### Bootstrap do primeiro administrador

Único ponto de criação de `Site` no MVP: uma transação única cria `User + Site + SiteUser(OWNER)` atomicamente — nunca exposto como endpoint HTTP. Falha parcial não deixa nenhum dos três registros criado (evita administrador órfão).

---

## 16. Autorização

- Autenticação (quem é você) e autorização (o que você pode fazer no Site atual) são tratadas separadamente.
- Toda autorização é resolvida via `SiteUser`, **nunca** via um `Role` global — a pergunta de todo Guard de escrita é: "este `User`, para o `siteId` já resolvido no contexto, tem `SiteUser` ativo com `Role` suficiente?"
- Ser `OWNER` em um Site não concede acesso a outro Site.
- Regra geral de Role: `VIEWER` lê; `EDITOR` cria/edita; `OWNER` também arquiva/exclui e (quando essa gestão existir, fora do MVP) administraria acesso de outros usuários ao Site.
- Trocar de projeto no admin não troca permissão automaticamente — se o usuário não tem `SiteUser` no Site escolhido, a API rejeita, mesmo que ele seja `OWNER` em outro Site.
- Usuário sem nenhum `SiteUser` é um **estado válido**: pode autenticar, mas recebe lista vazia de projetos; nenhum acesso é atribuído automaticamente.
- Na interface, esconder ações não autorizadas é apenas UX — a API é sempre a autoridade real sobre autorização.

---

## 17. Multi-Tenancy

### Modelo de isolamento de dados

Duas alternativas foram avaliadas:

- **Opção A — tabelas compartilhadas com coluna discriminadora `siteId`.**
- **Opção B — schema ou banco separado por Site.**

**Decisão:** Opção A. Schema/banco separado por Site seria complexidade operacional desproporcional para o número de tenants conhecido (2-3 sites) — overkill que contradiz o princípio de simplicidade antes de escala.

### Como o `siteId` é resolvido com confiança

- **`apps/fastcompre` nunca é fonte confiável de `siteId` por header/hostname isoladamente.** Em endpoints públicos, pode enviar um identificador público `siteSlug`, que a API resolve no `Site` real — esse identificador seleciona conteúdo público, **não é credencial nem prova de autorização**.
- Chamadas privilegiadas (operações administrativas, revalidação interna) exigem sessão real ou credencial de serviço — nunca confiam apenas em hostname, origem ou header declarativo.
- No admin, o usuário escolhe o "projeto atual" na interface, mas essa escolha só vira `siteId` efetivo depois que a API confirma um `SiteUser` válido daquele `User` para aquele `Site`.

### Por que middleware/extensão do Prisma não é tratado como garantia absoluta

Middleware e Prisma Client Extensions podem ajudar a criar um caminho tenant-aware por padrão, mas **não eliminam** riscos envolvendo raw queries, nested writes, relações, scripts ou tarefas assíncronas. Por isso, o isolamento é implementado em camadas:

1. A API resolve um `TenantContext` confiável após autenticação e validação do Site.
2. Casos de uso e repositórios tenant-aware exigem `siteId` — nunca opcional, nunca obtido do body.
3. O schema do banco usa unicidades por Site e relações compostas que impedem referências entre entidades de Sites diferentes.
4. Testes de integração comprovam que dados do Site A não podem ser lidos, alterados, vinculados ou excluídos por operações do Site B.
5. Prisma Client Extensions são defesa adicional/conveniência, nunca a única barreira.

---

## 18. TenantContext

No NestJS, o `TenantContext` é passado **explicitamente** aos casos de uso e repositórios — a árvore de providers não é toda tornada request-scoped, e não existe "tenant atual" global, request-scoped ou via `AsyncLocalStorage`. `AsyncLocalStorage` poderia ser considerado depois, apenas se a passagem explícita gerar repetição prejudicial comprovada — não é a abordagem inicial.

`TenantContext` é um **objeto imutável explícito** (`{ siteId, siteSlug }`), criado no controller/guard e passado como parâmetro, ponta a ponta, para o caso de uso. Nenhum módulo acessa um "tenant atual" por injeção implícita.

---

## 19. Fluxo de Publicação

O único caminho HTTP de publicação é:

```
POST /articles/:id/publish → (orquestrador HTTP-facing na Fase de Revalidação)
   → operação interna de publicação (valida regras + persiste status)
   → operação interna de marcação (mark-as-published, grava status e publishedAt)
   → adaptador de revalidação (aciona o Next.js)
```

A operação de publicação (interna, sem controller próprio) valida: status atual é `PENDING_REVIEW`; Categoria ativa; ao menos um Produto vinculado; cada Produto com Oferta válida; slug único; `metaDescription` preenchida; imagem de capa presente. Falha retorna a lista exata de pendências. Somente depois de todas as validações passarem, a operação de marcação (também interna, dentro de Editorial) grava `status = PUBLISHED` e `publishedAt`.

O caminho de arquivamento de Artigo publicado segue o mesmo padrão: um único orquestrador HTTP-facing chama a operação interna de arquivamento (`PUBLISHED → ARCHIVED`) e, em caso de sucesso, aciona o adaptador de revalidação.

**Nenhuma operação interna de publicação ou arquivamento tem controller HTTP próprio** — publicar ou arquivar sem passar pela coordenação de revalidação é impossível por desenho, não por convenção.

### Estados do Artigo e transições válidas

| Status | Editável (PATCH/vínculo de Produto)? | Transições permitidas |
|---|---|---|
| `DRAFT` | Sim — único status editável | → `PENDING_REVIEW` (enviar para revisão) |
| `PENDING_REVIEW` | Não | → `DRAFT` (voltar para rascunho) · → `PUBLISHED` (publicar) |
| `PUBLISHED` | Não | → `ARCHIVED` (retirar de publicação) |
| `ARCHIVED` | Não | → `DRAFT` (restaurar para rascunho — sem revalidação, artigo já estava fora do público) |

Editar um artigo em revisão exige `PENDING_REVIEW → DRAFT → editar → PENDING_REVIEW`. Editar um artigo arquivado exige `ARCHIVED → DRAFT → editar → PENDING_REVIEW → PUBLISHED`.

---

## 20. Fluxo de Tracking

```
Visitante clica no link do produto
   → GET /r/:siteSlug/:offerId (query opcional: articleId, utm_source, utm_medium, utm_campaign)
   → valida que Site, Oferta e (se informado) Artigo pertencem ao mesmo tenant
   → registra AffiliateClick (offerId, articleId?, referer e user-agent lidos de header — nunca query,
     tratados como telemetria não confiável, UTM capturado quando presente)
   → busca a affiliateUrl real no banco (nunca aceita URL vinda da requisição)
   → responde 302 para a affiliateUrl
```

Se a Oferta estiver arquivada, a resposta é **`410 Gone`**, com corpo de resposta já amigável (mensagem clara de indisponibilidade) — não existe fallback para página de Produto (não existe página pública de Produto isolada no MVP), e como o navegador nunca chega a uma página do `apps/fastcompre` quando `/r/...` responde diretamente, o corpo amigável precisa ser produzido pela própria API/Tracking, não por uma página Next.js.

A exclusão física de uma Oferta é bloqueada (`409`) quando ela possui `AffiliateClick` registrado — essa verificação pertence a um caso de uso cross-domain (Catalog + Tracking), nunca ao Catalog isoladamente, para não criar dependência de Catalog em Tracking.

Rate limit é aplicado tanto no login quanto neste endpoint de redirect.

---

## 21. Fluxo de Revalidação

O endpoint interno de revalidação vive em `apps/fastcompre` (não em `apps/api`), autenticado por segredo compartilhado em header — nunca por sessão de usuário, já que é uma chamada servidor-a-servidor (API → Next.js). A API acessa esse endpoint através de um adaptador cliente próprio.

### Gatilhos de revalidação

- Publicação de um Artigo.
- Arquivamento de um Artigo publicado.
- Criação, rename, arquivamento ou desarquivamento de Categoria — sempre, independentemente de haver Artigo `PUBLISHED` vinculado, porque Categoria alimenta uma superfície pública global (menu de navegação), não apenas os Artigos que a referenciam.
- Alteração em Produto (incluindo arquivar/desarquivar), Oferta (incluindo arquivar/desarquivar) ou Autor que estejam referenciados por um Artigo atualmente `PUBLISHED`.

Para garantir que nenhuma dessas alterações escape da coordenação, os endpoints HTTP administrativos de Categoria (criar, atualizar/renomear, arquivar, desarquivar), Produto (atualizar, arquivar/desarquivar), Oferta (atualizar, arquivar/desarquivar) e Autor (atualizar) continuam existindo, mas seus controllers HTTP-facing delegam à orquestração de Application responsável, em vez de chamar a operação interna de domínio diretamente. Essa orquestração coordena a operação interna responsável pela persistência da mutação e, somente após seu sucesso, aciona a revalidação pública (para Produto, Oferta e Autor, depois de descobrir quais Artigos publicados são afetados; para Categoria, diretamente, sitewide, independentemente de haver Artigo `PUBLISHED` vinculado) — e loga qualquer falha de revalidação sem reverter a mutação já persistida. A operação interna de domínio não é exposta por nenhum caminho HTTP alternativo que contorne essa orquestração.

`restore-to-draft` (`ARCHIVED → DRAFT`) **não** dispara revalidação por padrão — o Artigo já estava fora do conteúdo público.

### Natureza síncrona e tratamento de falha

A chamada de revalidação é síncrona no MVP — sem fila, outbox ou retry persistente. Uma falha na revalidação **nunca desfaz** a transação já persistida no banco; ela apenas gera um log estruturado, capturando: Site, recurso alterado, ID do recurso, Artigos afetados, erro, e data/hora. Não existe flag persistida de "revalidação pendente" — o schema do MVP não modela isso.

---

## 22. Responsabilidades de Cada Camada

Dentro de cada módulo de domínio em `apps/api`:

- **`domain`** — entidades, regras, erros e interfaces de domínio.
- **`application`** — casos de uso pertencentes exclusivamente àquele módulo (ex: criar Produto, arquivar Oferta). Casos de uso genuinamente cross-domain (publicar Artigo, calcular saúde, validar exclusão de Produto/Categoria, registrar clique e redirecionar, coordenar revalidação) vivem num módulo `application` de nível superior, fora de qualquer domínio específico.
- **`infrastructure`** — Prisma, repositories concretos, adaptadores externos.
- **`presentation`** — controllers HTTP, adaptando os contratos de `packages/contracts` para entradas dos casos de uso.

Não existe pasta `dto/` duplicada dentro da API — os contratos HTTP vivem inteiramente em `packages/contracts`; a camada de apresentação importa esses contratos e os transforma em entradas dos casos de uso. Validação estrutural mora no contrato (schema Zod); regra de negócio mora no domínio/application.

Uma área transversal restrita (`apps/api/src/shared/`: `database`, `config`, `logging`, `http`) existe para infraestrutura genuinamente genérica, mas **nunca pode conter regra de negócio**.

---

## 23. Convenções Adotadas

- Módulos organizados por domínio (`domain/application/infrastructure/presentation`), não por camada técnica genérica (`controllers/services/repositories/dto`).
- Casos de uso de exclusão/arquivamento/desarquivamento permanecem sempre três operações separadas e explícitas — nunca uma única operação combinada que decide sozinha "excluir ou arquivar". Excluir nunca arquiva silenciosamente quando bloqueado — sempre retorna erro explícito.
- Toda decisão que cruza domínios é coordenada por um único caso de uso de Application/orquestrador HTTP-facing — nenhum domínio acessa outro diretamente para contornar essa orquestração.
- Contratos HTTP (`packages/contracts`) exportam **schema de runtime (Zod) + tipo inferido (`z.infer`)**, não apenas `interface`/`type`. A API consome esse schema diretamente na validação de entrada; nunca duplica em DTO próprio.
- Um contrato tem uma única fonte de verdade — nunca duas definições independentes (uma na API, outra no package).
- Design visual inspirado em Apple, Stripe, Linear, Vercel, Notion — minimal, elegante, responsivo, rápido, consistente.
- Sentença de commit e revisão acompanham toda tarefa de implementação (ver `Implementation-Backlog.md`).

---

## 24. Estrutura do Monorepo

```text
commerce-platform/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
│
├── apps/
│   ├── api/
│   ├── fastcompre/
│   └── admin/
│
└── packages/
    └── contracts/
```

ESLint reaproveita o pacote já existente `@leogeison/eslint-config` — não foi criado um `packages/config` próprio, para evitar configuração duplicada e risco de divergência. TypeScript usa um `tsconfig.base.json` compartilhado na raiz, estendido pelos três apps; um package de configuração dedicado só nasceria se os arquivos da raiz deixassem de atender a uma necessidade concreta. Turborepo não foi adotado sem uma decisão explícita.

## 25. Apps

| App | Responsabilidade |
|---|---|
| `apps/api` | NestJS — único ponto de acesso ao Prisma/Postgres; centraliza domínios (Catalog, Editorial, Tracking, Identity), regras de negócio, autenticação, publicação, redirect de clique. |
| `apps/fastcompre` | Next.js público — páginas de artigo/categoria, geração estática + revalidação, consumindo a API no servidor. |
| `apps/admin` | Painel administrativo — CRUD de Produto/Oferta/Categoria/Artigo, fluxo de publicação, autenticação de admin, consumindo a API. |

`apps/quickdealday` explicitamente **não existe ainda** — só nasce quando o FastCompre estiver validado.

## 26. Packages

`packages/contracts` é o **único** package compartilhado próprio do MVP, com consumidores reais desde o início (`fastcompre`, `admin`, `api`). Contém exclusivamente contratos que atravessam a fronteira HTTP: tipos de request/response, enums públicos, paginação, formato de erro, contratos públicos/administrativos/de tracking/internos. Não contém: entidades Prisma, repositories, casos de uso, regras de domínio, serviços internos ou detalhes específicos do NestJS.

Estrutura interna:

```text
packages/contracts/
├── package.json
├── tsconfig.json
└── src/
    ├── public/
    ├── admin/
    ├── tracking/
    ├── internal/
    └── common/
```

Todos os demais candidatos a package (`ui`, `auth`, `seo`, `cms`, `affiliate`, `analytics`, `search`, `email`, `ai`, `storage`, `database`) permanecem **fora** do MVP — toda essa lógica de domínio mora dentro de `apps/api`, que é o único consumidor real dela hoje; extrair para package sem um segundo consumidor real seria a abstração especulativa que o projeto decidiu evitar.

`common` inclui `ApiError { statusCode, code, error, message, details? }` (o campo `code` é estável — o frontend usa `code`, nunca compara `message`) e `PaginatedResponse<T> { items, page, pageSize, total, totalPages }`.

---

## 27. Decisões sobre Prisma

### Modelo de dados aprovado (MVP)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── TENANCY ──────────────────────────────
model Site {
  id        String   @id @default(uuid())
  slug      String   @unique
  name      String
  domain    String   @unique
  locale    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  siteUsers       SiteUser[]
  categories      Category[]
  products        Product[]
  offers          Offer[]
  articles        Article[]
  authors         Author[]
  affiliateClicks AffiliateClick[]
}

// ── IDENTITY & ACCESS ────────────────────
// E-mails são sempre normalizados para minúsculas pela aplicação antes de
// gravar ou consultar.
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sessions       Session[]
  siteUsers      SiteUser[]
  authorProfiles Author[]
}

model Session {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt, revokedAt])
}

enum Role {
  OWNER
  EDITOR
  VIEWER
}

model SiteUser {
  id     String  @id @default(uuid())
  userId String
  siteId String
  role   Role    @default(EDITOR)
  active Boolean @default(true)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  site Site @relation(fields: [siteId], references: [id], onDelete: Cascade)

  @@unique([userId, siteId])
  @@index([siteId])
}

// ── CATALOG ──────────────────────────────
model Category {
  id         String    @id @default(uuid())
  siteId     String
  name       String
  slug       String
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  site     Site      @relation(fields: [siteId], references: [id], onDelete: Restrict)
  products Product[]
  articles Article[]

  @@unique([siteId, slug])
  @@unique([id, siteId])
}

model Product {
  id          String    @id @default(uuid())
  siteId      String
  categoryId  String?
  name        String
  slug        String
  description String?
  imageUrl    String?
  archivedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  site     Site      @relation(fields: [siteId], references: [id], onDelete: Restrict)
  category Category? @relation(fields: [categoryId, siteId], references: [id, siteId], onDelete: Restrict)

  offers   Offer[]
  articles ArticleProduct[]

  @@unique([siteId, slug])
  @@unique([id, siteId])
  @@index([siteId, archivedAt])
  @@index([siteId, categoryId, archivedAt])
}

enum Marketplace {
  AMAZON
  MERCADO_LIVRE
  SHOPEE
  ALIEXPRESS
  MAGALU
  HOTMART
  BRAIP
  KIWIFY
}

model Offer {
  id           String      @id @default(uuid())
  siteId       String
  productId    String
  marketplace  Marketplace
  price        Decimal     @db.Decimal(10, 2) // CHECK ("price" > 0) adicionado manualmente na migration
  currency     String      @default("BRL")
  affiliateUrl String
  inStock      Boolean     @default(true)
  archivedAt   DateTime?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  site    Site    @relation(fields: [siteId], references: [id], onDelete: Restrict)
  product Product @relation(fields: [productId, siteId], references: [id, siteId], onDelete: Restrict)

  affiliateClicks AffiliateClick[]

  @@unique([id, siteId])
  @@index([siteId, productId, archivedAt, inStock])
}

// ── EDITORIAL ────────────────────────────
enum ArticleType {
  REVIEW
  COMPARISON
  BUYING_GUIDE
  DEAL
}

// ARCHIVED significa retirada manual e deliberada de publicação pelo admin.
// Nunca é aplicado automaticamente por falta de Oferta válida.
enum ArticleStatus {
  DRAFT
  PENDING_REVIEW
  PUBLISHED
  ARCHIVED
}

model Article {
  id              String        @id @default(uuid())
  siteId          String
  categoryId      String?
  authorId        String?
  type            ArticleType
  status          ArticleStatus @default(DRAFT)
  title           String
  slug            String
  metaDescription String?
  coverImageUrl   String?
  bodyMdx         String        @default("")
  publishedAt     DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  site     Site      @relation(fields: [siteId], references: [id], onDelete: Restrict)
  category Category? @relation(fields: [categoryId, siteId], references: [id, siteId], onDelete: Restrict)
  author   Author?   @relation(fields: [authorId, siteId], references: [id, siteId], onDelete: Restrict)

  products        ArticleProduct[]
  affiliateClicks AffiliateClick[]

  @@unique([siteId, slug])
  @@unique([id, siteId])
  @@index([siteId, status, publishedAt])
}

model ArticleProduct {
  siteId    String
  articleId String
  productId String
  position  Int    @default(0)

  article Article @relation(fields: [articleId, siteId], references: [id, siteId], onDelete: Restrict)
  product Product @relation(fields: [productId, siteId], references: [id, siteId], onDelete: Restrict)

  @@id([siteId, articleId, productId])
}

model Author {
  id        String  @id @default(uuid())
  siteId    String
  userId    String?
  name      String
  bio       String?
  avatarUrl String?

  site Site  @relation(fields: [siteId], references: [id], onDelete: Restrict)
  user User? @relation(fields: [userId], references: [id], onDelete: Restrict)

  articles Article[]

  @@unique([id, siteId])
  @@unique([siteId, userId])
}

// ── TRACKING ─────────────────────────────
model AffiliateClick {
  id          String   @id @default(uuid())
  siteId      String
  offerId     String
  articleId   String?
  referer     String?
  userAgent   String?
  utmSource   String?
  utmMedium   String?
  utmCampaign String?
  clickedAt   DateTime @default(now())

  site    Site     @relation(fields: [siteId], references: [id], onDelete: Restrict)
  offer   Offer    @relation(fields: [offerId, siteId], references: [id, siteId], onDelete: Restrict)
  article Article? @relation(fields: [articleId, siteId], references: [id, siteId], onDelete: Restrict)

  @@index([siteId, clickedAt])
  @@index([siteId, offerId, clickedAt])
  @@index([siteId, articleId, clickedAt])
}
```

### Decisões de modelagem e justificativas

- **`Site.slug` é `String @unique` livre, nunca um enum fixo** — um enum travaria a plataforma exatamente às marcas conhecidas hoje, contradizendo a própria arquitetura multi-marca.
- **Ofertas ficam fora do Produto de propósito** — mesmo produto, várias fontes de afiliado, cada uma com seu próprio link e preço.
- **`Marketplace` e `origem do registro` são conceitos separados** — o enum `Marketplace` representa só a fonte comercial (Mercado Livre, Amazon, etc). Um campo de origem (`API_SYNC` vs `MANUAL`) foi avaliado, mas removido do MVP porque só `MANUAL` é usado hoje (ingestão automática está fora do MVP) — o campo só volta quando existir a primeira ingestão automatizada real.
- **`Author` pertence ao Site** (não é global) — o mesmo humano pode ter uma persona editorial diferente por marca (bio, tom, idioma), com relação opcional a `User`. `@@unique([siteId, userId])` permite autores convidados sem `User` (múltiplos `NULL` são permitidos pelo Postgres), mas impede que o mesmo `User` tenha mais de um perfil de Autor no mesmo Site.
- **Chaves compostas `[id, siteId]`** em `Category`, `Product`, `Offer`, `Article`, `Author` habilitam foreign keys compostas nas relações entre essas entidades (`Product.category`, `Article.category`, `Article.author`, `Offer.product`, `ArticleProduct`, `AffiliateClick.offer/article`) — o banco rejeita fisicamente vincular entidades de Sites diferentes, não depende só de validação de aplicação. **Risco documentado:** relações compostas que misturam um campo opcional com um campo obrigatório (quando a relação é opcional) esbarram numa limitação conhecida do Prisma (issue `#6042`) — só será confirmado ao rodar o validador num ambiente real, na primeira atividade de implementação; se rejeitado, a alternativa é FK manual via SQL na migration.
- **Praticamente todo `onDelete` é `Restrict`**, nunca `Cascade` — exclusões em cascata apagariam histórico e contradiriam a política de arquivamento. As únicas exceções são `Session→User` e `SiteUser→User/Site`, por serem vínculos de acesso sem valor de negócio independente. Um efeito colateral positivo: como `AffiliateClick→Offer` e `AffiliateClick→Article` são `Restrict`, o banco já impede fisicamente a exclusão de uma Oferta/Artigo com clique registrado, reforçando em nível de banco a regra de preservação de histórico.
- **`jsonLdSchema` não é persistido em `Article`** — os dados estruturados (JSON-LD) são derivados durante a renderização pública, a partir de Artigo, Autor, Produtos e Ofertas, evitando risco de dessincronização entre um valor salvo e o estado real dos dados.
- **`bodyMdx` tem `@default("")`** — permite criação progressiva do rascunho.
- **`ArticleProduct` usa `@@id([siteId, articleId, productId])`** — torna o tenant explícito na própria chave primária; um Produto tem apenas uma vinculação estrutural por Artigo no MVP.
- **`CHECK ("price" > 0)`** é adicionado manualmente à migration gerada com `--create-only` — Prisma não expressa esse tipo de constraint nativamente no schema.
- **`Tag`/`ArticleTag`, `Media`, `AIDraft` e `PriceHistory` não existem no MVP** — não fazem parte do escopo obrigatório (Etapa 2), e um schema menor evita modelar o que ainda não será construído.
- **Índices**: `Article` por `[siteId, status, publishedAt]`; `Product` por `[siteId, archivedAt]` e `[siteId, categoryId, archivedAt]`; `Offer` por `[siteId, productId, archivedAt, inStock]`; `Session` por `[userId]` e `[expiresAt, revokedAt]`; `AffiliateClick` por `[siteId, clickedAt]`, `[siteId, offerId, clickedAt]` e `[siteId, articleId, clickedAt]` — desenhados para os padrões de consulta previstos (listagem geral por Site/arquivamento, listagem por Categoria, cliques por Oferta e por Artigo separadamente).

### Validação automática do schema

Formatação, validação, geração de client e a primeira migration (`prisma format` → `validate` → `generate` → `migrate dev --create-only`) são deliberadamente **adiadas para a primeira atividade da fase de implementação**, imediatamente após o projeto NestJS + Prisma ser criado de fato — enquanto o projeto não existe, essa validação misturaria arquitetura com implementação. A ordem de checagem nesse momento cobre: sintaxe, relações compostas opcionais, compartilhamento de `siteId` entre relações, SQL das foreign keys, ações referenciais, índices gerados, `CHECK ("price" > 0)`, e possível drift após qualquer ajuste manual em SQL.

---

## 28. Decisões sobre Contratos

- `packages/contracts` é dividido por superfície: `public/`, `admin/`, `tracking/`, `internal/`, `common/`.
- Cada contrato exporta **schema de runtime (Zod) + tipo inferido (`z.infer`)** — não apenas um tipo estático. A API usa esse schema diretamente na validação de entrada (pipe de validação); nunca duplica em DTO próprio.
- Validação estrutural (forma do payload) mora no contrato; regra de negócio mora no domínio/application da API.
- Contratos públicos nunca expõem campos administrativos ou internos (ex: `PublicArticleDTO` nunca inclui `status` bruto ou qualquer campo de uso exclusivamente administrativo).
- O contrato de revalidação (`internal/revalidation`) fica isolado em sua própria pasta, não em `common`, por ser consumido apenas pelos dois lados internos (API e Next.js), nunca por um navegador.
- Contratos são entregues just-in-time, imediatamente antes da fase de implementação que os consome — nunca todos antecipadamente.

---

## 29. Decisões sobre Uploads

- Não existe entidade `Media` — o upload retorna uma URL, atribuída diretamente ao campo do recurso que a usa (`imageUrl` do Produto, `coverImageUrl` do Artigo, `avatarUrl` do Autor). Exceção: na finalidade `ARTICLE_BODY_IMAGE` (UXE-010), a URL retornada é persistida dentro do próprio `Article.bodyMdx`, como imagem do corpo do Artigo, sem campo dedicado. Consequência aceita: a mesma imagem enviada duas vezes gera dois uploads distintos, sem reuso — trade-off aceito pela simplicidade no MVP.
- Endpoint único: `POST /admin/sites/:siteSlug/uploads/images`, Role mínima `EDITOR`, entrada multipart com arquivo e finalidade (`PRODUCT`, `ARTICLE_COVER`, `AUTHOR_AVATAR` ou `ARTICLE_BODY_IMAGE`), resposta `{ url }`.
- Formatos permitidos e limite de tamanho são uma **decisão explícita e documentada**, separada da implementação da validação.
- Validação real de MIME (assinatura de arquivo/magic bytes), não apenas extensão ou `Content-Type` declarado.
- Nome do arquivo é sempre gerado pelo servidor — nunca o nome original do arquivo enviado.
- Armazenamento é desenhado com uma **porta explícita** (`StoragePort`), sem presumir Cloudflare R2 implicitamente — o adaptador concreto (disco local, S3-compatível, R2, etc.) é uma decisão à parte, pendente.

---

## 30. Decisões sobre Tracking

Ver detalhamento completo na Seção 20 (Fluxo de Tracking). Resumo das decisões estruturais:

- O módulo de Tracking é deliberadamente "burro": só recebe IDs/dados já validados por um caso de uso de Application, não valida Site/Oferta/Artigo por conta própria.
- Exclusão física de Oferta é bloqueada por existência de `AffiliateClick` — mas essa checagem não pertence ao Catalog (que não pode depender de Tracking); é um caso de uso cross-domain próprio.
- `410 Gone` (Oferta arquivada) inclui corpo de resposta amigável produzido pela própria API, já que o navegador nunca chega a uma página Next.js nesse fluxo.
- Rate limit aplicado ao endpoint de redirect, assim como ao login.

---

## 31. Decisões sobre API Pública

- Endpoints: listagem pública de Artigos (paginada, só `PUBLISHED`), detalhe público por slug, Categoria pública.
- Todo endpoint público retorna `categorySlug` junto do artigo — usado pelo `apps/fastcompre` para validar a URL recebida contra a categoria real (ver Seção 32, SEO).
- Nenhum conteúdo em `DRAFT`, `PENDING_REVIEW` ou `ARCHIVED` é exposto, mesmo que o slug exista sob outro status.
- Sem busca textual (fora do MVP); filtros permitidos: por categoria e por tipo, quando aplicável.
- Home pública ordena por `publishedAt DESC` com um critério de desempate secundário estável — nunca por `createdAt`/`updatedAt`, que representam outra coisa (criação do registro / última edição, não "quando ficou público"). Sem curadoria manual ou campo de destaque no MVP.

---

## 32. Decisões sobre Admin

### Mapa de páginas

| Página | Rota | Visibilidade |
|---|---|---|
| Login | `/login` | Sem sessão |
| Seletor de Site | `/` (pós-login) | Vem de `/admin/auth/me` |
| Categorias (lista/form) | `/:siteSlug/categories`, `/new`, `/:id` | `VIEWER+` leitura, `EDITOR+` edição, `OWNER` arquivar/excluir |
| Produtos + Ofertas embutidas | `/:siteSlug/products`, `/new`, `/:id` | idem |
| Autores (lista/form) | `/:siteSlug/authors`, `/new`, `/:id` | idem |
| Artigos (lista) | `/:siteSlug/articles` | `VIEWER+`, com filtro por status/tipo |
| Artigo (editor) | `/:siteSlug/articles/new` → `/:siteSlug/articles/:id` | Comportamento depende do status |

### Fluxo do seletor de Site

Zero Sites → tela "sem acesso a nenhum site" (estado válido, nunca erro). Exatamente um Site → redirecionamento automático para o painel daquele Site. Múltiplos Sites → seletor exibido, disponível também dentro do layout para troca posterior.

### Ofertas sem página própria

Deliberadamente embutidas na página do Produto — uma Oferta não é navegável por si só (sem título próprio, sem sentido fora do contexto do Produto); uma rota isolada só duplicaria navegação sem agregar valor.

### Os dois modos visuais da tela de Artigo

- **`DRAFT`** — formulário editável completo (título, corpo, SEO, capa, vínculo de Produtos).
- **`PENDING_REVIEW` / `PUBLISHED` / `ARCHIVED`** — conteúdo em modo leitura, com painel de ações de transição. **Nunca** a mesma tela com campos simplesmente desabilitados — são composições visuais diferentes, porque o foco muda de "editar conteúdo" para "decidir a próxima transição".

O checklist `/health` (saúde do Artigo) aparece em todo status, com framing diferente: `DRAFT` = checklist de preparação; `PENDING_REVIEW` = checklist de prontidão para publicação; `PUBLISHED` = saúde operacional; `ARCHIVED` = informação opcional.

### Filtros do MVP

Categorias: `archived?`. Produtos: `categoryId?`, `archived?`. Artigos: `status?`, `type?`, `categoryId?`. Autores: nenhum. Ofertas: nenhum. Sem busca textual em nenhuma listagem; todas paginadas.

### Autorização na interface

`VIEWER` abre detalhe em modo somente leitura; rotas `/new` e controles de edição exigem `EDITOR`; arquivamento e exclusão exigem `OWNER`. Esconder ações na interface é apenas UX — a API continua sendo a única autoridade de autorização real.

---

## 33. Decisões de SEO

- **Renderização SSR/SSG** via Next.js — indispensável para o Google ver o conteúdo pronto, sem depender de JavaScript no cliente.
- **Title tag** único por página, com padrão consistente (ex: "Melhor X em 2026 — Comparativo | FastCompre").
- **Meta description** por artigo, escrita manualmente no MVP (campo já existe no schema).
- **URL amigável**, sem IDs ou parâmetros (ex: `/comparativos/melhor-fone-bluetooth`).
- **Estrutura de heading correta** — um H1 por página, H2 organizando seções.
- **Dados estruturados (JSON-LD)** — `Article` e `Product` derivados durante a renderização, nunca persistidos (evita dessincronização entre valor salvo e estado real).
- **Sitemap.xml e robots.txt** gerados automaticamente a partir dos artigos publicados, percorrendo **toda** a listagem pública paginada (não apenas a primeira página).
- **Alt text** em toda imagem de produto.
- **Divulgação de afiliação visível** na página — exigência legal (Código de Defesa do Consumidor) e das políticas dos próprios programas de afiliado, não apenas boa prática de SEO.
- **URL canônica de categoria:** a URL pública de artigo é `/:categorySlug/:articleSlug`. Como `Article.categoryId` permanece opcional durante `DRAFT` mas passa a ser obrigatório no momento da publicação, a API pública sempre retorna `categorySlug`, e o `apps/fastcompre` confere se o `categorySlug` da URL recebida corresponde à categoria real do artigo — se não corresponder (mas o artigo existir), **redireciona permanentemente (301)** para a URL canônica; `404` apenas se o artigo em si não existir. Evita conteúdo duplicado sob duas URLs e preserva a autoridade de quem linkou a URL antiga.

---

*Fim do documento. Toda decisão aqui registrada reflete o estado aprovado ao final da Etapa 15. Em caso de trecho aparentemente conflitante nesta consolidação, prevalece a decisão mais recente aprovada na conversa original.*
