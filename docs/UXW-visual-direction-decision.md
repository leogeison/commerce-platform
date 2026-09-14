---
título: Decisão de direção visual — Trilha UXW (FastCompre público) — "Editorial Confiável"
status: registrado, aguardando investigação/desenho técnico da UXW-001
registrado_em: 2026-09-13
registrado_por: decisão explícita do Product Owner (Léo Geison), após aprovação de mockup de alta fidelidade (V1 e V2) para a direção "Editorial Confiável"
---

# Contexto

Antes de iniciar a UXW-001 (primeira tarefa da trilha FastCompre público), o
Product Owner solicitou uma proposta de direção visual final para o
FastCompre, com o objetivo explícito de evitar duas rodadas de
implementação: uma primeira com aparência provisória e uma segunda de
redesign amplo depois que toda a trilha UXW estivesse implementada.

A proposta foi conduzida em etapas, todas fora do escopo de qualquer tarefa
do backlog, sem alteração de arquivo de código ou de documentação
normativa:

1. uma investigação de produto/UX apresentando 3 direções visuais
   alternativas (Editorial Premium, Comparação/Conversão, e "Editorial
   Confiável" como combinação equilibrada), com vantagens, desvantagens e
   recomendação;
2. um mockup de alta fidelidade (V1) da direção recomendada, cobrindo Home,
   Categoria, Artigo, Header, Footer, drawer mobile e o bloco
   Produto/Oferta ("cartão de decisão"), em desktop e mobile;
3. uma V2 do mockup, evoluindo a apresentação visual (maior presença de
   imagem, hierarquia mais expressiva, cartão de decisão com mais
   destaque) preservando integralmente a arquitetura de decisão da V1;
4. uma iteração visual adicional baseada na V2, utilizando fotografias
   realistas de produto como referência visual, mantendo a mesma direção
   estrutural.

O Product Owner aprovou "FastCompre — Editorial Confiável" como a direção
conceitual final para a trilha UXW, através de decisão explícita
registrada em conversa com o assistente.

Este documento apenas **registra a decisão**, para que uma sessão futura
que inicie qualquer tarefa `UXW-*` tenha o contexto sem depender do
histórico de conversa. Nenhuma implementação foi autorizada por este
registro.

# Natureza da aprovação

O mockup foi aprovado explicitamente como **referência de direção
visual — não como especificação funcional literal ou pixel-perfect**.
Isso significa:

- a direção orienta hierarquia visual, composição, tom editorial,
  densidade e o papel de cada elemento de interface;
- ela não substitui, antecipa nem reinterpreta nenhum critério de aceite
  já escrito em `UX-Implementation-Backlog.md` para as tarefas `UXW-*`;
- cada tarefa `UXW-*` continua sendo investigada, desenhada e aprovada
  individualmente, no fluxo obrigatório já em vigor neste projeto — esta
  decisão não substitui esse fluxo, apenas fornece a referência visual de
  destino;
- direção visual não autoriza antecipação funcional: nenhuma tarefa pode
  usar esta decisão como justificativa para implementar escopo de uma
  tarefa posterior, pular pré-requisitos do DAG, ou fechar um critério de
  aceite de forma diferente do que o backlog determina.

# 1. Princípios normativos

Devem orientar toda implementação futura das tarefas `UXW-*`. Diferem dos
itens da Seção 2 porque não são meramente estéticos — várias destas
decisões já são requisitos existentes em `Architecture.md`,
`UX-Implementation-Backlog.md` ou nos tokens já aprovados; esta decisão os
reafirma como parte da direção visual, sem alterá-los:

- direção "Editorial Confiável" como identidade visual de destino do
  FastCompre;
- conteúdo editorial como protagonista da experiência — a interface de
  produto/comercial não compete visualmente com o conteúdo;
- Source Serif 4 para conteúdo/títulos editoriais, conforme o escopo
  tipográfico já aprovado em `UXF-001` e nos tokens de
  `packages/ui/tokens/typography.css` — esta decisão não introduz nova
  tipografia, apenas confirma seu uso consistente na direção final;
- Geist Sans para interface funcional (navegação, botões, metadados, UI
  em geral);
- verde-floresta como accent de uso contido, com uso principal em ações e
  CTA — nunca como cor decorativa de preenchimento amplo; o accent já foi
  validado em WCAG 2.2 AA em `UXF-001`, e esta decisão não reabre essa
  validação, apenas reafirma o padrão de uso;
- conversão clara, sem estética agressiva de marketplace — CTA fácil de
  encontrar, sem elementos de urgência, ranking ou comparação de preço
  artificial;
- Produto/Oferta visualmente distinguível do conteúdo editorial, sem
  parecer publicidade;
- o bloco Produto/Oferta ("cartão de decisão") como componente
  reconhecível e consistente em toda ocorrência no site;
- mobile-first;
- WCAG 2.2 AA como requisito verificável, não uma auditoria opcional
  posterior;
- foco visível e gestão de foco, navegação completa por teclado,
  contraste AA, touch targets adequados, e reflow/zoom — preservados em
  qualquer refinamento visual, exatamente como já vigente no projeto;
- ausência de dark patterns;
- transparência de afiliação sempre visível, conforme `Architecture.md`,
  Seção 33 — este documento não altera o texto de divulgação já existente
  no MVP, apenas confirma sua apresentação visual íntegra;
- performance e SEO como já normatizados (`UXF-013`/`UXF-014`,
  `Architecture.md` Seção 33) — nenhum refinamento visual pode degradar o
  budget já definido sem registro explícito do desvio;
- não inventar dados, estados ou funcionalidades que o domínio/API atual
  não forneçam — nenhuma tarefa `UXW-*` pode introduzir taxonomia,
  métrica, badge, filtro ou página que dependa de campo inexistente no
  schema/contratos atuais, mesmo que a direção visual sugira sua
  presença.

# 2. Direção visual (refinável empiricamente)

Orientam a implementação, mas ficam sujeitos a refinamento durante a
investigação/desenho técnico de cada tarefa `UXW-*` correspondente — não
são congelados como valor final:

- fotografias/imagens com forte presença editorial;
- hierarquia visual mais expressiva na Home e na página de Categoria;
- cards de Artigo visualmente maduros, com maior presença de imagem;
- bastante espaço em branco, densidade confortável;
- ritmo editorial confortável entre seções;
- Header enxuto, coerente com o MVP;
- Footer sóbrio;
- bloco Produto/Oferta com superfície própria e presença suficiente para
  ser facilmente escaneável durante a leitura, sem parecer anúncio;
- fotografia de Produto (usada no cartão de decisão) e imagem
  editorial/capa de Artigo como responsabilidades conceitualmente
  distintas — mesmo que hoje possam usar o mesmo campo de imagem no
  schema, a direção visual as trata como papéis diferentes, sujeitos a
  decisão própria nas tarefas correspondentes;
- necessidade futura de consistência de enquadramento, iluminação,
  proporção e tratamento das imagens — reconhecida aqui como direção, sem
  que este documento crie um pipeline, guideline de produção de imagem ou
  nova convenção de asset; isso pertence a uma tarefa futura, se e quando
  for aberta.

# 3. Referência não normativa (o mockup não congela)

O(s) mockup(s) aprovado(s) (V1 e V2, incluindo a iteração visual adicional
com fotografias realistas de produto) são referência visual, não
especificação. Os itens abaixo **não** estão congelados por esta decisão
e continuam em aberto para cada tarefa `UXW-*` decidir, na sua própria
investigação/desenho técnico:

- pixels exatos;
- breakpoints exatos;
- largura exata dos containers;
- quantidade exata de cards por seção/página;
- textos, títulos, nomes de produto e datas usados no mockup — são
  fictícios, criados apenas para compor a visualização;
- imagens específicas usadas no mockup — inclusive as fotografias de
  produto usadas na iteração da V2;
- preços e exemplos numéricos mostrados;
- composição exata de cada página;
- o símbolo de "check" verde mostrado junto ao wordmark "FastCompre" no
  mockup — **não deve ser registrado como logotipo oficial**; é
  exploração visual de um placeholder de marca, sem decisão de identidade
  gráfica associada;
- logotipo/identidade gráfica definitiva do FastCompre;
- a escolha entre dropdown único de Categorias ou links diretos na
  navegação — permanece em aberto, a ser decidida pela tarefa responsável
  pela navegação (`UXW-003`);
- qualquer funcionalidade ou dado não existente no MVP que apareça
  visualmente sugerido no mockup (ex.: variações de conteúdo, estados
  ainda não implementados).

# Objetivo desta decisão

Evitar uma segunda rodada ampla de redesign depois da implementação
completa da trilha `UXW-*`. Cada tarefa `UXW-*` deve caminhar
progressivamente em direção a "Editorial Confiável", mas continua
obrigada a respeitar integralmente seu próprio escopo, seus critérios de
aceite e o DAG de dependências já registrado em
`UX-Implementation-Backlog.md` (incluindo a correção `UXW-011 → UXE-021`
já registrada). Direção visual não autoriza antecipação funcional, sob
nenhuma circunstância.

# Próximo passo autorizado (ainda não iniciado)

A investigação técnica formal da `UXW-001`, confrontando:

1. esta decisão de direção visual;
2. o texto normativo já existente em `UX-Implementation-Backlog.md` para
   `UXW-001` e demais tarefas da trilha;
3. o estado real do código em `apps/fastcompre` e dos tokens/primitives já
   existentes em `packages/ui`.

O desenho técnico deve ser apresentado e aprovado antes de qualquer
implementação — mesmo fluxo obrigatório já em vigor para todas as tarefas
deste projeto. Nenhuma implementação de `UXW-001` (ou de qualquer outra
tarefa `UXW-*`) foi autorizada até o momento deste registro.
