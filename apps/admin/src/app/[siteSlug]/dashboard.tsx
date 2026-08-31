'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  CircleCheck,
  Clock,
  FileText,
  Hourglass,
  ShoppingBag,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  listArticlesResponseSchema,
  type ArticleStatus,
  type ArticleSummaryAdmin,
} from '@commerce-platform/contracts';
import { apiRequest } from '../../lib/api-client';
import { AdminApiError } from '../../lib/api-error';
import { TYPE_LABELS } from '../../lib/article-labels';
import { roleMeetsMinimum } from '../../lib/role-hierarchy';
import { EmptyState, ErrorState, LoadingState } from './async-state';
import { CREATE_ACTIONS, createActionHref } from './create-actions';
import { useSiteRole } from './site-role-context';

interface DashboardProps {
  siteSlug: string;
}

type ArticleListSectionState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ArticleSummaryAdmin[] };

const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

/**
 * Quantidade fixa das três seções (UXA-017, estendida pela UXA-018) — não
 * há quantidade normativa definida no backlog para nenhuma delas
 * (verificado contra `UX-Implementation-Backlog.md`/`Architecture.md`
 * antes de cada uma das duas tarefas: nenhum dos dois documenta um
 * número). Decisão de produto explícita: 5 itens por seção — "seções
 * operacionais de retomada/acompanhamento, não uma segunda listagem de
 * Artigos" (`ArticleList` já cobre a listagem completa, com paginação e
 * `PAGE_SIZE = 20`). Sem paginação nem "Ver todos" em nenhuma das três: um
 * 6º item simplesmente não aparece até um dos 5 sair do topo pela
 * ordenação da seção, comportamento aceito, não uma pendência técnica.
 */
const SECTION_ITEMS_LIMIT = 5;

function resolveErrorMessage(error: unknown, genericMessage: string): string {
  if (
    error instanceof AdminApiError &&
    error.statusCode !== undefined &&
    BUSINESS_ERROR_STATUS_CODES.has(error.statusCode)
  ) {
    return error.message;
  }
  return genericMessage;
}

/**
 * `status` fixo por seção, `pageSize` fixo (`SECTION_ITEMS_LIMIT`) e sem
 * filtro/paginação — mesmo shape de query string das três seções, só
 * `orderBy` varia (presente para "Continuar de onde parei"/"Publicados
 * recentemente", ausente para "Aguardando publicação", que usa o default
 * já existente do repository). Generaliza o que UXA-017 tinha como
 * `buildDraftsPath` — a query string resultante para `status=DRAFT` com
 * `orderBy='updatedAt_desc'` é byte a byte idêntica à daquela tarefa
 * (`page=1&pageSize=5&status=DRAFT&orderBy=updatedAt_desc`), preservando o
 * contrato já validado manualmente.
 */
function buildSectionPath(
  siteSlug: string,
  status: ArticleStatus,
  orderBy?: 'updatedAt_desc' | 'publishedAt_desc',
): string {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('pageSize', String(SECTION_ITEMS_LIMIT));
  params.set('status', status);
  if (orderBy !== undefined) {
    params.set('orderBy', orderBy);
  }
  return `/admin/sites/${encodeURIComponent(siteSlug)}/articles?${params.toString()}`;
}

function articleHref(siteSlug: string, articleId: string): string {
  return `/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(articleId)}`;
}

/**
 * `Intl.DateTimeFormat('pt-BR', ...)` — nenhum utilitário de formatação de
 * data existe hoje em `apps/admin/src` (só `apps/fastcompre`, fora deste
 * app); instanciado uma vez, fora do componente, reaproveitado por
 * renderização e pelas três seções — `Intl.DateTimeFormat` é seguro para
 * reuso (sem estado mutável entre chamadas de `.format()`). Data absoluta
 * (dia/mês/ano + hora/minuto), não relativa ("há 2 dias") — decisão da
 * UXA-017, mantida: nenhum componente de tempo relativo existe no
 * projeto, e introduzir um seria escopo além do pedido.
 */
const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function formatDate(isoDate: string): string {
  return DATE_FORMATTER.format(new Date(isoDate));
}

/**
 * Hook privado de fetch/estado, compartilhado pelas três seções (UXA-018 —
 * extração aprovada por ser, ela mesma, o segundo consumidor real do
 * padrão que a UXA-017 estabeleceu para "Continuar de onde parei"; mesmo
 * princípio já usado no projeto para `packages/ui` — promover só quando
 * um segundo consumidor real comprova o reuso — aplicado aqui à escala do
 * próprio componente, não de um pacote). Deliberadamente privado a este
 * arquivo, não movido para `lib/`: nenhuma seção fora do Dashboard usa
 * esta mecânica hoje.
 *
 * Cada chamada deste hook mantém seu próprio estado (`useState` próprio,
 * não compartilhado entre seções) e seu próprio efeito — três chamadas no
 * corpo do `Dashboard` disparam três fetches paralelos, sem waterfall
 * (nenhuma depende da conclusão de outra) e sem que a falha de uma seção
 * alcance as outras duas: o `.catch` de cada seção só atualiza o estado
 * daquela própria seção. O teste formal dedicado a esse isolamento
 * ("uma seção falha, as outras continuam legíveis") fica para UXA-019,
 * cujo critério de aceite é esse — aqui cada seção só prova seu próprio
 * error state individualmente.
 */
function useArticleListSection(
  siteSlug: string,
  status: ArticleStatus,
  orderBy: 'updatedAt_desc' | 'publishedAt_desc' | undefined,
  genericErrorMessage: string,
): ArticleListSectionState {
  const [state, setState] = useState<ArticleListSectionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    apiRequest(buildSectionPath(siteSlug, status, orderBy), listArticlesResponseSchema)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'ready', items: data.items });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'error', message: resolveErrorMessage(error, genericErrorMessage) });
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, status, orderBy, genericErrorMessage]);

  return state;
}

const DRAFTS_ERROR_MESSAGE = 'Não foi possível carregar os rascunhos. Tente novamente em instantes.';
const PENDING_REVIEW_ERROR_MESSAGE =
  'Não foi possível carregar os Artigos aguardando publicação. Tente novamente em instantes.';
const PUBLISHED_ERROR_MESSAGE =
  'Não foi possível carregar os Artigos publicados recentemente. Tente novamente em instantes.';

/**
 * UXA-019A — hierarquia visual das três seções via prop explícita, nunca
 * inferida do texto do `title` (frágil, e acopla apresentação a copy).
 * `primary` = "Continuar de onde parei" (painel coeso, mais forte);
 * `secondary` = as outras duas (painel mais leve). Local a este arquivo —
 * `ArticleListSection` não é consumido fora do Dashboard.
 */
type ArticleListSectionVariant = 'primary' | 'secondary';

const SECTION_VARIANT_CLASSES: Record<ArticleListSectionVariant, string> = {
  primary: 'bg-surface border border-outline rounded-control p-6',
  secondary: 'bg-subtle-surface rounded-control p-4',
};

interface ArticleListSectionProps {
  headingId: string;
  title: string;
  /**
   * UXA-019A — ícone decorativo (`aria-hidden`) do heading da seção: Clock
   * ("Continuar de onde parei"), Hourglass ("Aguardando publicação"),
   * CircleCheck ("Publicados recentemente"). Renderizado dentro do próprio
   * `<h2>`, antes do texto, mas com `aria-hidden="true"` — a algoritmo de
   * nome acessível ignora nós `aria-hidden`, então o nome do heading (e da
   * `<section aria-labelledby>` que aponta para ele) continua sendo
   * exatamente `title`, sem o ícone.
   */
  headingIcon: LucideIcon;
  /**
   * UXA-019A (rodada visual final) — cor do ícone do heading, decidida por
   * seção, sem nenhum token novo em `tailwind-theme.css`. "Continuar de
   * onde parei" e "Publicados recentemente" usam `text-accent-subtle-fg`
   * (`--color-accent-subtle-text`, verde-800) — mesmo alias já exposto e já
   * usado como cor de texto/ícone em acento verde semântico pela UXA-019B
   * (estado ativo do rail lateral, `sidebar-nav.tsx`), não uma decisão
   * nova. "Aguardando publicação" usa `text-fg-muted` — tratamento neutro
   * deliberado: o design system não tem token semântico de warning
   * (`semantic-colors.css` documenta que warning/info só entram
   * just-in-time, com consumidor normativo real), então esta seção não
   * ganha nenhuma cor de destaque, só o mesmo token secundário/muted já
   * usado nos ícones decorativos da linha (`FileText`/`ChevronRight`).
   */
  headingIconClassName: string;
  variant: ArticleListSectionVariant;
  state: ArticleListSectionState;
  emptyMessage: string;
  siteSlug: string;
  /**
   * `undefined` = item sem linha secundária de data (ver "Aguardando
   * publicação" abaixo). Retorno `null` do próprio formatador = mesma
   * ausência de linha para aquele item específico (só usado por
   * "Publicados recentemente", ver `Dashboard`, para o caso defensivo de
   * `publishedAt` nulo — que a invariante de publicação não deveria
   * permitir para um Artigo `PUBLISHED`, mas que este componente não
   * mascara com outro campo/data incorreta).
   */
  formatSecondaryLine?: (article: ArticleSummaryAdmin) => string | null;
}

/**
 * Markup comum às três seções — região identificável (`aria-labelledby`)
 * apontando para o próprio heading, mesmo padrão que UXA-019 vai estender
 * quando adicionar atalhos/estados de falha parcial, sem antecipar essa
 * estrutura aqui. A linha secundária de data é opcional por seção: só
 * "Continuar de onde parei" e "Publicados recentemente" têm um timestamp
 * real e relevante para mostrar (`updatedAt`/`publishedAt`); "Aguardando
 * publicação" não tem nenhum timestamp que represente "entrou em
 * revisão" — mostrar `createdAt` sob esse rótulo seria dado real com
 * legenda enganosa, e nenhum texto foi inventado para preencher essa
 * lacuna (decisão explícita desta tarefa).
 *
 * UXA-019A — cada seção vira um painel coeso (`SECTION_VARIANT_CLASSES`),
 * não uma lista com borda por item: a superfície é aplicada na própria
 * `<section>`, e as linhas internas se separam por `divide-y` (token
 * `border-subtle`, via alias `outline-subtle`) em vez de cada `<li>` ter
 * seu próprio card. Badge de Tipo (`TYPE_LABELS[article.type]`, único dado
 * novo exibido — já presente em `ArticleSummaryAdmin`) fica ao lado do
 * título dentro de um contêiner `flex flex-wrap`: `min-w-0` no próprio
 * `<Link>` é o que permite ao navegador de fato encolher/quebrar um título
 * longo em vez de mantê-lo no seu min-content intrínseco (o gotcha clássico
 * de flexbox — sem isso, `overflow-wrap`/`break-words` não teria efeito
 * dentro de uma linha flex); o badge é `shrink-0` e pode cair para a linha
 * seguinte (`flex-wrap`) se não houver espaço, mas nunca é comprimido nem
 * força overflow horizontal. Nenhum `truncate` — título sempre legível por
 * inteiro, só quebrando em mais de uma linha quando necessário. O `<Link>`
 * continua tendo `article.title` como único filho — nome acessível
 * inalterado.
 *
 * UXA-019A (revisão) — três acréscimos puramente decorativos por linha,
 * nenhum deles filho do `<Link>` do título nem parte do seu nome acessível:
 * ícone `FileText` antes do bloco título+badge, e `ChevronRight` ao final
 * da linha (`aria-hidden`, sem `motion`/transform — permanentemente visível,
 * já funciona como affordance de "linha navegável" sem precisar se mover no
 * hover). A linha inteira fica clicável/hoverável via "stretched link": o
 * `<li>` ganha `relative` (contexto de posicionamento) e o `<Link>` do
 * título ganha `after:absolute after:inset-0 after:content-['']` — um
 * pseudo-elemento invisível que cobre toda a área do `<li>` e captura
 * clique/toque/hover ali, SEM adicionar nenhum filho real ao `<Link>`
 * (pseudo-elementos não são nós do DOM: não entram no cálculo de nome
 * acessível nem em `.textContent`). `article.title` continua sendo,
 * literalmente, o único filho do `<Link>` — a garantia normativa não muda.
 * Nenhum outro elemento dentro do `<li>` é interativo (badge e ambos os
 * ícones são `<span>`/SVG decorativos, sem `href`/`onClick`) — não há
 * controle concorrente disputando a mesma área. Hover é só troca sutil de
 * superfície no próprio `<li>` (`hover:bg-subtle-surface`, mesmo alias já
 * exposto por esta tarefa): `:hover` de um elemento se propaga para todos
 * os ancestrais cuja caixa contém o ponteiro, então passar o mouse sobre o
 * pseudo-elemento (ou sobre badge/ícones, fisicamente dentro da caixa do
 * `<li>`) já ativa o `:hover` do próprio `<li>` — sem JS, sem nova
 * transição/animação, sem complexidade adicional de `prefers-reduced-motion`.
 * `focus-visible` do `<Link>` continua sendo o outline nativo do navegador,
 * inalterado por esta tarefa (nunca teve estilo próprio antes; não é
 * introduzido agora — fora do escopo desta revisão).
 *
 * UXA-019A (rodada visual final) — linha reestruturada para
 * `ícone | bloco de conteúdo | chevron` como os três filhos diretos do
 * `<li>` (antes o ícone/badge/chevron dividiam uma única linha flex com o
 * título; a data ficava fora dessa linha, como um segundo filho solto do
 * `<li>`, desalinhada do resto do conteúdo). Agora o bloco de conteúdo é a
 * única coluna entre ícone e chevron: título sozinho na primeira linha,
 * badge de Tipo + data (quando existe) juntos como metadata secundária
 * logo abaixo, no mesmo contêiner `flex flex-wrap` — os dois quebram juntos
 * quando o espaço aperta, sem nenhum `truncate` em nenhum dos dois. `<li>`
 * usa `items-start` (não `items-center`): com o bloco de conteúdo podendo
 * ter uma ou duas linhas (título + metadata), alinhar ícone/chevron ao
 * topo do bloco fica mais estável visualmente do que centralizar contra a
 * altura total, que varia por item. `after:absolute after:inset-0` no
 * `<Link>` do título e `relative` no `<li>` continuam exatamente iguais —
 * o stretched link não muda, só a estrutura visual ao redor dele.
 */
function ArticleListSection({
  headingId,
  title,
  headingIcon: HeadingIcon,
  headingIconClassName,
  variant,
  state,
  emptyMessage,
  siteSlug,
  formatSecondaryLine,
}: ArticleListSectionProps) {
  return (
    <section
      aria-labelledby={headingId}
      className={`flex flex-col gap-4 ${SECTION_VARIANT_CLASSES[variant]}`}
    >
      <h2 id={headingId} className="m-0 flex items-center gap-2 font-ui text-lg font-action text-fg">
        <HeadingIcon aria-hidden="true" className={`shrink-0 ${headingIconClassName}`} size={20} />
        {title}
      </h2>

      {state.status === 'loading' && <LoadingState>Carregando...</LoadingState>}

      {state.status === 'error' && <ErrorState>{state.message}</ErrorState>}

      {state.status === 'ready' &&
        (state.items.length === 0 ? (
          <EmptyState>{emptyMessage}</EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0 divide-y divide-outline-subtle">
            {state.items.map((article) => {
              const secondaryLine = formatSecondaryLine?.(article) ?? null;
              return (
                <li
                  key={article.id}
                  className="relative -mx-2 flex items-start gap-2 rounded-control px-2 py-3 first:pt-0 last:pb-0 hover:bg-subtle-surface"
                >
                  <FileText aria-hidden="true" className="mt-0.5 shrink-0 text-fg-muted" size={18} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      href={articleHref(siteSlug, article.id)}
                      className="min-w-0 break-words after:absolute after:inset-0 after:content-['']"
                    >
                      {article.title}
                    </Link>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="shrink-0 rounded-pill bg-outline-subtle px-2 py-0.5 font-ui text-body-sm text-fg-secondary">
                        {TYPE_LABELS[article.type]}
                      </span>
                      {secondaryLine !== null && (
                        <span className="font-ui text-body-sm text-fg-muted">{secondaryLine}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight aria-hidden="true" className="mt-0.5 shrink-0 text-fg-muted" size={18} />
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}

/**
 * Classes locais espelhando a composição de `Button` (`packages/ui`,
 * `variant="primary"|"secondary"`, `size="sm"`) — mesmos tokens públicos já
 * usados em todo o projeto (`bg-accent`, `bg-surface`, `border-outline`
 * etc.), não uma cópia dos internals privados daquele componente
 * (`VARIANT_CLASSES`/`SIZE_CLASSES` nunca são exportados, nem de
 * `button.tsx` nem do `index.ts` de `packages/ui` — confirmado antes desta
 * tarefa). Duplicação deliberada: `Button` não tem nenhuma API de
 * composição (`asChild`/`render`/equivalente) que preserve um `<a href>`
 * real, e os atalhos abaixo são navegação (`Link`), não `<button
 * onClick={router.push}>` — um `<button>` para navegar seria semântica
 * incorreta (sem `href`, sem "abrir em nova aba" via Cmd/Ctrl+clique, fora
 * do comportamento nativo de link). `packages/ui`/`Button` não foram
 * alterados por esta tarefa.
 *
 * UXA-019A (revisão) — os atalhos passam de "pill" horizontal para card
 * (ícone + título + subtítulo, empilhados). Mesma duplicação deliberada de
 * `Button` explicada acima, só que agora compondo um bloco com mais
 * conteúdo em vez de um botão de texto único; os tokens públicos usados
 * continuam os mesmos (`bg-accent`/`bg-surface`/`border-outline` etc.),
 * nenhum novo alias foi adicionado a `tailwind-theme.css` para isto — o
 * subtítulo usa o modificador de opacidade nativo do Tailwind
 * (`text-fg-on-accent/80` no card primário) em vez de um token dedicado de
 * "texto secundário sobre acento", que não existe hoje no design system.
 */
const PRIMARY_CREATE_ACTION_CARD_CLASSES =
  'flex flex-col items-start gap-2 rounded-control p-4 text-left font-ui bg-accent hover:bg-accent-hover active:bg-accent-active text-fg-on-accent focus-visible:outline-none focus-visible:ring-2 ring-focus';
const SECONDARY_CREATE_ACTION_CARD_CLASSES =
  'flex flex-col items-start gap-2 rounded-control p-4 text-left font-ui bg-surface border border-outline text-fg hover:bg-subtle-surface focus-visible:outline-none focus-visible:ring-2 ring-focus';

/**
 * UXA-019A — mapa local de ícones decorativos dos atalhos de criação.
 * Deliberadamente não importado de `sidebar-nav.tsx` (que não exporta
 * `SEGMENT_ICONS`, e não está na lista de arquivos desta tarefa) nem
 * extraído para um módulo compartilhado — reaproveita a MESMA decisão
 * visual já fechada na UXA-019B (Artigo→FileText, Produto→ShoppingBag,
 * Categoria→Tag, Autor→Users), não o módulo. `create-actions.ts` não é
 * alterado por esta tarefa.
 *
 * Mesma filosofia de `iconForSegment` (`sidebar-nav.tsx`): `segment` em
 * `CreateAction` é `string`, não um literal union (mesma razão — anotação
 * de tipo `readonly CreateAction[]` impede o TypeScript de estreitar), então
 * `satisfies Record<CreateActionSegment, LucideIcon>` só garante a
 * cobertura em tempo de compilação; a checagem `in` + `throw` em runtime é
 * o que garante falha explícita caso um `CREATE_ACTIONS` futuro traga um
 * `segment` sem ícone mapeado aqui, em vez de um ícone `undefined` silencioso.
 */
type CreateActionSegment = 'articles' | 'products' | 'categories' | 'authors';

const CREATE_ACTION_ICONS = {
  articles: FileText,
  products: ShoppingBag,
  categories: Tag,
  authors: Users,
} satisfies Record<CreateActionSegment, LucideIcon>;

function iconForCreateAction(segment: string): LucideIcon {
  if (!(segment in CREATE_ACTION_ICONS)) {
    throw new Error(`Dashboard: nenhum ícone mapeado para o atalho de criação "${segment}".`);
  }
  return CREATE_ACTION_ICONS[segment as CreateActionSegment];
}

/**
 * UXA-019A — mapa local de subtítulos dos cards de atalho, mesmo padrão de
 * `CREATE_ACTION_ICONS`/`iconForCreateAction` acima (local a este arquivo,
 * checagem `in` + `throw` em runtime, nunca em `create-actions.ts`). Texto
 * puramente informativo/visível — nunca `aria-hidden` — que complementa
 * `action.label` sem fazer parte do nome acessível do card (ver
 * `CreateShortcuts`: o nome acessível vem de `aria-label={action.label}`,
 * não do conteúdo do `<Link>`).
 */
const CREATE_ACTION_SUBTITLES = {
  articles: 'Criar um novo artigo editorial',
  products: 'Cadastrar um novo produto',
  categories: 'Criar uma nova categoria',
  authors: 'Adicionar um novo autor',
} satisfies Record<CreateActionSegment, string>;

function subtitleForCreateAction(segment: string): string {
  if (!(segment in CREATE_ACTION_SUBTITLES)) {
    throw new Error(`Dashboard: nenhum subtítulo mapeado para o atalho de criação "${segment}".`);
  }
  return CREATE_ACTION_SUBTITLES[segment as CreateActionSegment];
}

/**
 * Fileira de atalhos de criação no topo do Dashboard (UXA-019).
 * Reaproveita `CREATE_ACTIONS`/`createActionHref` (UXA-010, mesma fonte já
 * consumida pela Command Palette) — nenhuma segunda lista local, ordem
 * preservada exatamente como declarada ali. Filtragem por item
 * (`roleMeetsMinimum(role, action.minRole)`), não um corte único para a
 * fileira inteira — mesmo padrão já usado em `command-palette.tsx`, para
 * continuar correto mesmo se `minRole` deixar de ser uniforme entre as 4
 * entidades no futuro. Hoje todas exigem `EDITOR`, então `VIEWER` não vê
 * nenhum atalho e `EDITOR`/`OWNER` veem os 4 — sem nenhum caso
 * intermediário possível com os dados atuais de `CREATE_ACTIONS`.
 *
 * Esconder o atalho é só UX (Architecture.md §16) — a rota `/new` de cada
 * entidade continua atrás do mesmo `@MinRole('EDITOR')` já existente no
 * backend, inalterado por esta tarefa; nenhum controller/guard foi tocado.
 *
 * `CREATE_ACTIONS[0]` ("Novo Artigo") é a ação primária (decisão de
 * produto desta tarefa, aprovada); os demais três são secundários. Sem
 * nenhum atalho visível (`VIEWER`), o componente devolve `null` — nenhum
 * contêiner vazio fica no DOM.
 *
 * UXA-019A (revisão) — cada atalho é um card (ícone decorativo + título +
 * subtítulo visível), não mais um "pill" de texto único. O subtítulo é
 * conteúdo informativo real (nunca `aria-hidden`); para o nome acessível do
 * card continuar sendo só `action.label` (sem o subtítulo grudado nele), o
 * `<Link>` recebe `aria-label={action.label}` — `aria-label` tem
 * precedência sobre o conteúdo textual no algoritmo de nome acessível,
 * então o `getByRole('link', { name: action.label })` que os testes já
 * usavam continua funcionando sem alteração. Grid `grid-cols-2` (2×2) nas
 * larguras estreitas, widening para uma única linha de 4 em `md:` (≥768px):
 * `.content` do shell autenticado tem `padding: 1.5rem` fixo em todas as
 * larguras (`authenticated-shell.module.css`) e o rail lateral só passa a
 * ocupar 256px fixos a partir de `lg`/1024px (UXA-019B) — abaixo disso a
 * largura de conteúdo é `viewport - 48px`. Em 768px de viewport (`md`, sem
 * rail ainda) isso dá ~720px de conteúdo; com `gap-3` (12px × 3 gaps) entre
 * 4 colunas, cada card fica com ~171px — comparável ao card 2×2 em uma tela
 * de 390px (~165px), então não fica mais apertado do que a própria coluna
 * de 2 já é em mobile estreito. Abaixo de `md`, 4 colunas ficariam mais
 * estreitas que isso (ex.: em 640px/`sm`, ~139px/card) — por isso `sm` foi
 * descartado como breakpoint de widening, e `md` foi o menor breakpoint
 * considerado confortável a partir do markup real, sem harness visual
 * dedicado (validação final de 360/390/768/1024/1280 fica para o usuário
 * na aplicação real).
 */
function CreateShortcuts({ siteSlug }: { siteSlug: string }) {
  const role = useSiteRole();
  const visibleActions = CREATE_ACTIONS.filter((action) => roleMeetsMinimum(role, action.minRole));

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {visibleActions.map((action) => {
        const Icon = iconForCreateAction(action.segment);
        const isPrimary = action === CREATE_ACTIONS[0];
        return (
          <Link
            key={action.segment}
            href={createActionHref(siteSlug, action.segment)}
            aria-label={action.label}
            className={isPrimary ? PRIMARY_CREATE_ACTION_CARD_CLASSES : SECONDARY_CREATE_ACTION_CARD_CLASSES}
          >
            <span className="flex items-center gap-2">
              <Icon aria-hidden="true" className="shrink-0" size={20} />
              <span className="font-action text-body-sm">{action.label}</span>
            </span>
            <span className={`text-body-sm ${isPrimary ? 'text-fg-on-accent/80' : 'text-fg-secondary'}`}>
              {subtitleForCreateAction(action.segment)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * UXA-017/UXA-018/UXA-019 — Dashboard do Admin: fileira de atalhos de
 * criação role-gated no topo (UXA-019) seguida de três seções: "Continuar
 * de onde parei" (`DRAFT`, `updatedAt desc`, UXA-017), "Aguardando
 * publicação" (`PENDING_REVIEW`, `createdAt desc` — default existente,
 * sem `orderBy` novo) e "Publicados recentemente" (`PUBLISHED`,
 * `publishedAt desc`, UXA-018). Tratamento de falha parcial (uma seção
 * falha sem derrubar as outras) já é garantido pela independência de
 * estado/efeito entre as três chamadas de `useArticleListSection` — não é
 * um mecanismo novo desta tarefa, só passa a ter prova formal em teste
 * (ver `dashboard.spec.tsx`).
 *
 * UXA-019A — cabeçalho `<h1>Dashboard</h1>` + descrição editorial estática
 * (sem dado dinâmico) passam a fazer parte deste componente, nunca de
 * `page.tsx` (que continua Server Component fino, só repassando
 * `siteSlug` — não tocado por esta tarefa). Layout: cabeçalho → fileira de
 * atalhos → "Continuar de onde parei" (`variant="primary"`, painel coeso
 * em destaque) → "Aguardando publicação"/"Publicados recentemente"
 * (`variant="secondary"`, painéis mais leves) em grid de duas colunas —
 * `xl:grid-cols-2`, uma coluna abaixo disso. Breakpoint decidido por
 * medição real: com o rail fixo de 256px da UXA-019B, a largura de
 * conteúdo em `lg` (1024px de viewport) é só ~720px — cada coluna
 * secundária ficaria com ~348px, insuficiente para título+badge+data sem
 * quebra excessiva. Em `xl` (1280px de viewport), a largura de conteúdo é
 * ~976px — cada coluna com ~476px comporta título+badge numa linha e data
 * numa segunda linha, confortável.
 *
 * Revisão desta mesma tarefa: cada linha de Artigo ganhou um ícone
 * `FileText` (~18px + 8px de gap) e um `ChevronRight` (~18px) nas duas
 * pontas, reduzindo a largura útil de cada coluna secundária em ~44px.
 * Reavaliado a partir do mesmo cálculo (sem novo harness/medição visual):
 * em `xl`, ~476px − 44px ≈ 432px ainda é confortável para título+badge numa
 * linha; em `lg`, ~348px − 44px ≈ 304px pioraria um cenário que já era
 * insuficiente antes dos ícones. `xl:grid-cols-2` continua sendo o
 * breakpoint adequado — mantido, não alterado por esta revisão.
 *
 * Rodada visual final (mesma tarefa) — cor dos ícones de heading:
 * "Continuar de onde parei" e "Publicados recentemente" em
 * `text-accent-subtle-fg` (verde semântico já exposto, ver doc comment de
 * `ArticleListSectionProps` acima); "Aguardando publicação" em
 * `text-fg-muted` (neutro, sem token de warning). Nenhum token novo em
 * `tailwind-theme.css`; breakpoints `md` (cards de atalho) e `xl` (grid
 * secundário) preservados, já validados visualmente pelo usuário. Linha de
 * Artigo reestruturada (`ícone | bloco de conteúdo | chevron`, título
 * isolado na primeira linha do bloco, badge+data como metadata que quebra
 * junto) — ver doc comment de `ArticleListSection` para o detalhe.
 *
 * Ordem do DOM sempre Cabeçalho → Atalhos → Continuar → Aguardando →
 * Publicados, igual à ordem visual (nenhum CSS de reordenação).
 */
export function Dashboard({ siteSlug }: DashboardProps) {
  const draftsState = useArticleListSection(siteSlug, 'DRAFT', 'updatedAt_desc', DRAFTS_ERROR_MESSAGE);
  const pendingReviewState = useArticleListSection(
    siteSlug,
    'PENDING_REVIEW',
    undefined,
    PENDING_REVIEW_ERROR_MESSAGE,
  );
  const publishedState = useArticleListSection(
    siteSlug,
    'PUBLISHED',
    'publishedAt_desc',
    PUBLISHED_ERROR_MESSAGE,
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-ui text-2xl font-action text-fg">Dashboard</h1>
        <p className="m-0 font-ui text-body text-fg-secondary">
          Acompanhe seu fluxo editorial e retome o trabalho rapidamente.
        </p>
      </div>

      <CreateShortcuts siteSlug={siteSlug} />

      <ArticleListSection
        headingId="dashboard-drafts-heading"
        title="Continuar de onde parei"
        headingIcon={Clock}
        headingIconClassName="text-accent-subtle-fg"
        variant="primary"
        state={draftsState}
        emptyMessage="Nenhum rascunho em andamento."
        siteSlug={siteSlug}
        formatSecondaryLine={(article) => `Atualizado em ${formatDate(article.updatedAt)}`}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ArticleListSection
          headingId="dashboard-pending-review-heading"
          title="Aguardando publicação"
          headingIcon={Hourglass}
          headingIconClassName="text-fg-muted"
          variant="secondary"
          state={pendingReviewState}
          emptyMessage="Nenhum Artigo aguardando publicação."
          siteSlug={siteSlug}
        />

        <ArticleListSection
          headingId="dashboard-published-heading"
          title="Publicados recentemente"
          headingIcon={CircleCheck}
          headingIconClassName="text-accent-subtle-fg"
          variant="secondary"
          state={publishedState}
          emptyMessage="Nenhum Artigo publicado recentemente."
          siteSlug={siteSlug}
          formatSecondaryLine={(article) =>
            article.publishedAt ? `Publicado em ${formatDate(article.publishedAt)}` : null
          }
        />
      </div>
    </div>
  );
}
