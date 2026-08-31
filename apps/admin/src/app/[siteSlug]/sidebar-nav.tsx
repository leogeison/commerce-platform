'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode
} from 'react';
import { usePathname } from 'next/navigation';
import {
  FileText,
  LayoutDashboard,
  Menu as MenuIcon,
  ShoppingBag,
  Tag,
  Users,
  X,
  type LucideIcon
} from 'lucide-react';
import { GuardedLink } from './guarded-link';
import {
  isNavDestinationActive,
  NAV_DESTINATIONS,
  navDestinationHref
} from './nav-destinations';
import styles from './sidebar-nav.module.css';

interface SidebarNavProps {
  siteSlug: string;
}

/**
 * UXA-006 — Sidebar de navegação primária.
 *
 * Arquitetura de informação definitiva (Etapa A / UX-Implementation-Backlog.md):
 * Dashboard→Artigos→Produtos→Categorias→Autores. Os 5 itens são renderizados
 * nesta ordem desde a UXA-017, quando `apps/admin/src/app/[siteSlug]/page.tsx`
 * (Dashboard) passou a existir — antes disso, só os 4 itens com rota já
 * existente eram renderizados (UXA-006), porque um item apontando para
 * Dashboard teria sido um link morto (404). `isNavDestinationActive`
 * (`nav-destinations.ts`) trata Dashboard como rota raiz (igualdade exata,
 * nunca prefixo) — os outros 4 continuam na regra de igualdade OU subrota
 * documentada abaixo.
 *
 * Sem prop de Role. As quatro seções são leitura disponível a
 * VIEWER/EDITOR/OWNER igualmente — `Architecture.md` §32 lista "VIEWER+
 * leitura" para as quatro, e nenhuma das quatro páginas de lista
 * (`categories/page.tsx`, `products/page.tsx`, `authors/page.tsx`,
 * `articles/page.tsx`) nega renderização por Role hoje. Restrições de Role
 * continuam ocorrendo dentro de cada tela (ex.: `category-list.tsx` esconde
 * "Criar" para quem não é `EDITOR+`, via `roleMeetsMinimum` de
 * `role-hierarchy.ts`) — nunca na sidebar. Por isso `SidebarNav` recebe só
 * `siteSlug`: criar uma prop `role` e um mecanismo de filtro agora seria
 * abstração sem necessidade real (mesmo princípio já aplicado em
 * UXA-001/002/003/004/005A — infraestrutura nasce de necessidade
 * comprovada, não de antecipação). `SiteRoleProvider` permanece com seu
 * alcance atual (só `children`/`<main>`), sem ampliação.
 *
 * `usePathname()` próprio — componente autocontido, mesmo padrão de
 * `GuardedLink` (que também resolve seu próprio `useRouter()`). Isso torna
 * `usePathname()` desnecessário em `authenticated-shell.tsx`, que deixa de
 * importá-lo.
 *
 * Item ativo por igualdade OU prefixo de seção
 * (`pathname === href || pathname.startsWith(`${href}/`)`), regra já
 * comprovada no shell atual — garante que `/categories/new` e
 * `/categories/:id` também marquem "Categorias" como seção atual, não só a
 * listagem exata, sem marcar falsamente uma rota-irmã com prefixo textual
 * parecido (ex.: um hipotético `/categories-archive` nunca bate, porque o
 * `startsWith` exige a barra depois do segmento). Dashboard (UXA-017) é a
 * única exceção a essa regra — `isNavDestinationActive` aplica só
 * igualdade exata para `isRootRoute`, porque `href` de Dashboard é
 * `/:siteSlug` e a regra de prefixo bateria com toda rota do Site.
 *
 * `GuardedLink` em todos os itens — nenhum item pula o dirty-state guard
 * (UXA-003); a Promise de `confirmLeave()` é a mesma instância consumida
 * por troca de Site/Logout em `authenticated-shell.tsx`, via
 * `UnsavedChangesProvider` (`layout.tsx`).
 *
 * UXA-008 — Adaptação responsiva do shell (drawer abaixo de `lg`).
 *
 * Breakpoint `lg` (1024px, token padrão do Tailwind v4, sem token
 * customizado): medição empírica (Chromium/Playwright, componentes reais
 * `SidebarNav`+`Topbar`, não uma reprodução aproximada) mostrou a
 * composição inline ainda quebrada (nav e Topbar em linhas separadas) em
 * todas as larguras de 320px a 900px — inclusive em ~768px, onde `md`
 * ainda está dentro da faixa quebrada — e estável a partir de ~910px. O
 * próximo breakpoint padrão do Tailwind igual ou acima do cruzamento real
 * é `lg`. Por isso a navegação persistente (`hidden lg:block`) e o
 * trigger do drawer (`lg:hidden`) usam `lg`, nunca `md`.
 *
 * Mesma origem de dados para as duas apresentações: `renderNavList()`
 * mapeia `NAV_DESTINATIONS` uma única vez, chamado tanto para a navegação
 * persistente quanto para o conteúdo do drawer — nunca uma segunda lista
 * divergente. Desde UXA-009, `NAV_DESTINATIONS`/`navDestinationHref` vivem
 * em `nav-destinations.ts`, não mais aqui — a Command Palette se tornou um
 * segundo consumidor real da mesma lista, e mantê-la só neste componente
 * duplicaria exatamente o dado que este comentário já protegia de
 * duplicação interna. Extração sem alteração de comportamento: mesmos 4
 * itens, mesmos rótulos/segmentos, mesma ordem.
 *
 * Drawer via `<dialog>` nativo + `showModal()` (mesmo padrão já
 * comprovado em `unsaved-changes-context.tsx`/UXA-003, com o mesmo
 * polyfill de teste em `jest.setup.ts`, reaproveitado sem alteração):
 * foco preso ao conteúdo do diálogo, `Escape` fecha nativamente, clique
 * fora (no próprio elemento `<dialog>`, isto é, na área do backdrop,
 * nunca em um filho) fecha via `onClick` comparando `event.target`. O
 * botão "Fechar menu" é o primeiro elemento do diálogo e recebe foco
 * inicial via `autoFocus`/`[autofocus]` (comportamento nativo do
 * `showModal()`, sem lógica manual).
 *
 * Nenhuma restauração de foco é feita manualmente aqui — nem para
 * fechamento explícito (botão/Escape/backdrop) nem para fechamento por
 * mudança de `pathname`. Confirmado empiricamente em Chromium (o mesmo
 * usado pelo projeto) que `<dialog>.close()` sempre restaura foco ao
 * elemento que tinha foco no momento de `showModal()` — aqui, o próprio
 * trigger "Menu" — de forma síncrona e nativa, em todos os caminhos de
 * fechamento sem exceção. Aceitar esse comportamento nativo também no
 * fechamento por navegação é uma decisão desta tarefa: uma política
 * própria de foco pós-navegação SPA (por exemplo, focar o heading da
 * página seguinte) é um problema mais amplo do shell, não deste
 * componente, e fica para uma tarefa futura de acessibilidade dedicada a
 * isso — não é antecipada aqui.
 *
 * Fechamento por navegação real, nunca por `onClick` do link: um
 * `useEffect` observa o `pathname` já lido por este componente e só fecha
 * o `<dialog>` quando o valor muda de fato em relação à renderização
 * anterior (uma ref local guarda o valor anterior, inicializada com o
 * próprio `pathname` da montagem — por isso nunca fecha na montagem
 * inicial). Cobre lista/`/new`/detalhe igualmente, porque qualquer
 * navegação real para uma rota diferente muda `pathname`, independente do
 * segmento. Se `GuardedLink` interceptar a navegação por dirty-state e o
 * usuário escolher "Ficar" (`unsaved-changes-context.tsx`), `pathname`
 * nunca muda e o `<dialog>` permanece aberto — nenhuma alteração em
 * `GuardedLink` foi necessária para isso.
 *
 * Fechamento na transição para `lg+`: um
 * `<dialog>` aberto via `showModal()` continua modal mesmo depois que o
 * CSS passa a ocultar o markup mobile (`lg:hidden`) — sem isto, redimensionar
 * a janela de estreita para `lg+` com o drawer aberto deixaria um modal
 * invisível ainda bloqueando/inertizando o resto da página. Um segundo
 * `useEffect`, local a este componente (nenhuma infraestrutura global de
 * viewport), assina `window.matchMedia('(min-width: 1024px)')` — o mesmo
 * valor de `lg`, sem token novo — via `addEventListener('change', ...)` e
 * fecha o `<dialog>` só se ele estiver aberto no momento em que a media
 * query passa a bater. `removeEventListener` no cleanup evita listener
 * órfão a cada desmonte/remontagem. `typeof window.matchMedia ===
 * 'function'` protege apenas o ambiente de teste (jsdom não implementa
 * `matchMedia` nesta suíte — confirmado empiricamente), no mesmo espírito
 * de `useIsomorphicLayoutEffect` em `unsaved-changes-context.tsx`; em
 * qualquer navegador real a checagem é sempre verdadeira. Confirmado em
 * Chromium real: após a transição, `dialog.open` vira `false`, a
 * navegação desktop fica utilizável (não inert), e o foco — que a
 * restauração nativa tentaria devolver ao trigger "Menu", agora oculto
 * por `lg:hidden` e portanto não focável — cai em `document.body` (nenhum
 * elemento preso), sem travar em nada invisível.
 *
 * UXA-019B — Sidebar lateral vertical em desktop.
 *
 * Este componente retorna um Fragment com três elementos-irmãos: um `div`
 * wrapper do botão "Menu" (grid-area `menu`), o `nav` persistente
 * (grid-area `rail`, `lg+`) e o `dialog` do drawer. `authenticated-
 * shell.tsx` renderiza este componente como filho direto do grid `.shell`
 * (`authenticated-shell.module.css`), fora de `<header>` — como um
 * Fragment não introduz caixa própria, o wrapper e o `nav` viram, eles
 * mesmos, itens de grid do `.shell`, por isso recebem `grid-area`
 * diretamente (`[grid-area:menu]`/`lg:[grid-area:rail]`), sem `display:
 * contents`. O wrapper do botão existe para dar à célula `menu` uma
 * borda inferior própria (ver doc comment do botão "Menu" mais abaixo) —
 * sem ele, o botão sozinho não teria como estender essa borda por toda a
 * altura da linha do grid. O `dialog` do drawer não recebe `grid-area`:
 * como elemento nativo `<dialog>`, ele é `display: none` da UA
 * stylesheet enquanto fechado e passa a `position: fixed`/top-layer via
 * `showModal()` quando aberto — em nenhum dos dois estados ele participa
 * da geração de itens de grid do `.shell`, então nenhum posicionamento é
 * necessário nem produz efeito.
 *
 * Abaixo de `lg`, `nav` continua `hidden` (mesmo padrão de antes) — o
 * `grid-area: menu` do wrapper é o único posicionamento ativo nessa
 * faixa, reproduzindo a composição horizontal Menu+Topbar já existente,
 * agora como itens de grid irmãos em vez de filhos do mesmo `<header>`.
 *
 * A partir de `lg`, `nav` vira o rail: `lg:flex lg:flex-col` substitui o
 * antigo `hidden lg:block` (que preservava o layout horizontal do `<ul>`
 * interno); a lista em si (`renderNavList`) também passou de
 * `'m-0 flex list-none gap-4 p-0'` para `'m-0 flex list-none flex-col gap-4
 * p-0'` — mesma função, mesmo dado (`NAV_DESTINATIONS`), só a direção do
 * eixo principal muda. O drawer mobile (`<ul>` dentro do `dialog`) já usava
 * `flex-col` desde antes desta tarefa e não foi alterado.
 *
 * Branding "FastCompre / ADMIN": um `<span>` estático, primeiro filho do
 * `nav` persistente, antes do `<ul>`. Deliberadamente não é `<a>`, não tem
 * `onClick`, `href`, `tabIndex` nem qualquer handler — não é focável e não
 * participa da lista de elementos focáveis do shell nem do drawer mobile
 * (só existe dentro do `nav` de desktop, nunca dentro do `dialog`). Não
 * altera a contagem/ordem dos 5 links reais de `NAV_DESTINATIONS`.
 *
 * Ícones decorativos: `iconForSegment(item.segment)` (ver mapa
 * `SEGMENT_ICONS` acima) resolve um componente `lucide-react` por destino,
 * renderizado como `<Icon aria-hidden="true" />` antes do texto do label,
 * dentro do próprio `<GuardedLink>`. `aria-hidden` remove o SVG da árvore
 * de acessibilidade — o nome acessível de cada link continua sendo
 * exatamente `item.label` (texto), sem concatenação de texto alternativo
 * do ícone nem qualquer outra alteração ao cálculo de accessible name.
 *
 * Estado ativo: `bg-accent-subtle`/`text-accent-subtle-fg` (aliases de
 * `packages/ui/tokens/tailwind-theme.css`, mapeando sem valor de cor novo
 * os tokens já existentes `--color-accent-subtle-bg`/
 * `--color-accent-subtle-text` de `semantic-colors.css`) somam-se ao
 * `underline` para que o item ativo continue distinguível sem depender só
 * de cor (WCAG 1.4.1), além do `aria-current="page"` programático já
 * emitido por `isNavDestinationActive`. Ver UXA-019C abaixo para a
 * evolução deste tratamento (pílula).
 *
 * UXA-019B (refinamento) — Trigger mobile compacto + drawer como gaveta lateral.
 *
 * O botão "Menu" abaixo de `lg` deixou de exibir texto visível — vira
 * `<MenuIcon aria-hidden="true" />` + `<span className="sr-only">Menu</span>`,
 * preservando o nome acessível exato ("Menu", texto ainda presente no DOM,
 * só oculto visualmente pela técnica `sr-only` já usada em
 * `command-palette.tsx`) enquanto reduz a largura ocupada na faixa superior
 * compacta. O botão vive dentro de um wrapper (`[grid-area:menu]`, ver doc
 * comment mais abaixo) que ocupa a altura cheia da linha do grid (`.shell`
 * não declara `align-items`, então o item de grid estica por padrão) — é
 * isso que permite a borda inferior do wrapper acompanhar a borda do
 * `<header>` na mesma altura; o botão em si fica centralizado dentro do
 * wrapper (`items-center`/`self-center`), independente da altura da linha
 * em zoom alto/nomes de Site longos que forcem quebra.
 *
 * O `<dialog>` ganha `className={styles.drawer}` (`sidebar-nav.module.css`,
 * novo arquivo — primeiro CSS Module deste componente; a decisão anterior
 * de evitar CSS Module aqui era só sobre `grid-area`, que continua via
 * classe Tailwind arbitrária, não reaberta) — estiliza a MESMA instância de
 * `<dialog>`/`showModal()` como uma gaveta lateral fixada à esquerda, largura
 * `min(85vw, 320px)`, altura cheia, com scrim próprio via `::backdrop`.
 * Nenhuma linha de mecanismo muda: `showModal()`/`close()`, o listener
 * nativo de `Escape` (evento `cancel` → `close()`), `onClose`,
 * `handleBackdropClick` (a comparação `event.target === dialogRef.current`
 * continua válida — depende só de clique fora da caixa própria do
 * `<dialog>`, não da posição/tamanho dela), os dois `useEffect` de
 * fechamento por `pathname`/`matchMedia(lg)`, e `autoFocus` no botão de
 * fechar continuam exatamente como estavam. Nenhuma transição/animação foi
 * adicionada (decisão explícita desta rodada — comportamento estático).
 *
 * Conteúdo do `<dialog>` ganha uma linha de cabeçalho (branding "FastCompre
 * / ADMIN", igual ao do rail, + botão de fechar com `<X aria-hidden="true"
 * />` e `<span className="sr-only">Fechar menu</span>`, mesmo nome acessível
 * de antes) antes do `<nav>` — o botão de fechar continua sendo o primeiro
 * elemento focável do diálogo (o `<span>` de branding não é focável),
 * preservando a ordem de foco já testada. `renderNavList()` do drawer
 * perdeu o `mt-4` do `<ul>`: o espaçamento entre o cabeçalho e a lista agora
 * vem do `gap` do próprio `.drawer` (flex column), não mais de uma margem
 * pontual no `<ul>`.
 *
 * UXA-019C — pílula ativa, branding restrito ao rail/drawer, copyright no rail.
 *
 * Estado ativo (`renderNavList`): o `underline` que somava ao par
 * `bg-accent-subtle`/`text-accent-subtle-fg` foi removido — decisão
 * fechada na aprovação do desenho técnico desta tarefa. A não-dependência
 * exclusiva de cor (WCAG 1.4.1) passa a vir de dois sinais não-cromáticos
 * combinados: forma (só o item ativo usa `rounded-pill`, os inativos
 * seguem `rounded-control` — cantos francamente diferentes, não uma
 * variação sutil) e o `aria-current="page"` programático, inalterado. Os
 * links passam a ter `px-control-x py-control-y` (antes sem padding
 * algum) — necessário para o preenchimento de fundo do estado ativo
 * (`bg-accent-subtle`) ganhar a respiração de uma pílula de verdade em
 * vez de colar direto no ícone/texto; aplicado a todos os itens (ativo e
 * inativos), não só ao ativo, para que nenhum item mude de tamanho ao
 * navegar entre eles. Nenhum token novo (`--radius-pill`/`--spacing-
 * control-x`/`--spacing-control-y` já existiam e já eram consumidos em
 * outros componentes, ex. `topbar.tsx`).
 *
 * Mobile fechado: só hambúrguer, seletor de Site, busca e avatar (os
 * quatro controles reais) — nenhuma representação da marca "FastCompre"
 * fora do rail/drawer, evitando duplicação de identidade visual na faixa
 * mais estreita. O branding completo "FastCompre"/"ADMIN" continua
 * exclusivamente no rail (`lg+`) e no cabeçalho do drawer.
 *
 * Copyright: `<p>` estático, último filho do `<nav>` persistente
 * (desktop, `lg+`), texto fixo "© 2026 FastCompre. Todos os direitos
 * reservados." (microdecisão fechada no desenho técnico — nenhum cálculo
 * de ano). `mt-auto` dentro do `<nav>` (`lg:flex lg:flex-col`, que já
 * ocupa a altura cheia da área `rail` do grid) empurra o texto para o
 * rodapé sem precisar de nenhuma mudança estrutural no CSS Module do
 * shell. Deliberadamente só no rail desktop — decisão fechada na
 * aprovação do desenho técnico: o `<dialog>` do drawer mobile não ganha
 * este rodapé (o requisito normativo fala em "rodapé do rail", e
 * replicar no drawer ampliaria o escopo sem necessidade). `text-fg-muted`
 * (mesmo token secundário já usado no "ADMIN" da marca) — nenhuma cor
 * nova.
 *
 * `authenticated-shell.module.css` define o padding estrutural do
 * `<header>` e a largura fixa do rail — ver doc comment do próprio
 * arquivo CSS para os valores atuais; o grid em si (`grid-template-
 * areas`, breakpoint `1024px`) não depende desses valores.
 *
 * Botão "Menu" (hambúrguer): fica dentro de um wrapper próprio
 * (`lg:hidden [grid-area:menu]`) cuja borda inferior (`border-b
 * border-[#e5e7eb]`) usa a mesma cor do `border-bottom` de `.header`
 * (`authenticated-shell.module.css`) — dá continuidade visual à borda do
 * header através da célula do hambúrguer, que de outro modo ficaria sem
 * ela nessa largura. `self-center` centraliza o botão dentro do wrapper.
 * O botão em si usa `HAMBURGER_CLASSES` (constante local, abaixo) —
 * mantida separada de `BUTTON_CLASSES` porque hambúrguer e "Fechar menu"
 * (drawer) são controles logicamente distintos, ainda que hoje tenham a
 * mesma receita visual. `data-density="compact"` no botão reduz seu
 * `px-control-x py-control-y` de 16px/12px para 12px/8px (mesmo
 * mecanismo de `packages/ui/tokens/spacing.css` usado em `topbar.tsx` —
 * custom properties CSS aplicadas a um elemento também valem para o
 * próprio elemento, não só para descendentes).
 *
 * `<nav>` persistente (rail): `data-density="compact"` (mesmo efeito nos
 * 5 links de `renderNavList`, via `px-control-x py-control-y` já
 * existente neles) com `gap`/`padding` Tailwind reduzidos
 * (`lg:gap-4`/`lg:p-3`) — não cobertos pelo token de densidade (são
 * valores fixos, não `--space-control-*`). O branding "FastCompre"/
 * "ADMIN" não usa nenhum token de fonte menor que `text-body-sm` (não
 * existe um em `tailwind-theme.css`); a compactação vem só do `gap`
 * reduzido do `<nav>`, que aproxima o bloco de branding do restante do
 * conteúdo.
 */
const BUTTON_CLASSES =
  'rounded-control border border-outline bg-surface px-control-x py-control-y text-body-sm font-ui font-action text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus';

// Classe do botão "Menu" (hambúrguer) — mantida separada de
// `BUTTON_CLASSES` porque são controles logicamente distintos (hambúrguer
// vs. "Fechar menu" do drawer), ainda que hoje compartilhem a mesma
// receita visual.
const HAMBURGER_CLASSES =
  'rounded-control border border-outline bg-surface px-control-x py-control-y text-body-sm font-ui font-action text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus';

// Mesmo valor de `lg` usado nas classes Tailwind abaixo — não é um token
// novo, só a forma que `matchMedia` exige para observar a transição.
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

/**
 * Mapa local de ícones decorativos (UXA-019B) — deliberadamente não movido
 * para `nav-destinations.ts`: esse módulo também é consumido pela Command
 * Palette (`command-palette.tsx`), que não usa ícone por item; acoplar
 * ícones lá criaria acoplamento apresentacional desnecessário para um
 * consumidor que não precisa dele. `NavSegment` espelha localmente os
 * segmentos hoje suportados por `NAV_DESTINATIONS` — não é derivado dele,
 * porque a assinatura `NAV_DESTINATIONS: readonly NavDestination[]`
 * (anotação de tipo antes do `as const`) impede o TypeScript de estreitar
 * `segment` para os literais reais; ele permanece `string` mesmo com
 * `as const` no array. `satisfies Record<NavSegment, LucideIcon>` garante,
 * em tempo de compilação, que todo segmento de `NavSegment` tem um ícone
 * mapeado. Isso não protege contra o caso inverso — um destino futuro
 * adicionado a `NAV_DESTINATIONS` com um segmento ainda ausente de
 * `NavSegment`/`SEGMENT_ICONS` — porque `segment` ali é só `string`; por
 * isso `iconForSegment` faz uma checagem explícita de runtime (`in`) e
 * lança um erro claro em vez de deixar `SEGMENT_ICONS[segment as
 * NavSegment]` produzir `undefined` silenciosamente.
 */
type NavSegment = '' | 'articles' | 'products' | 'categories' | 'authors';

const SEGMENT_ICONS = {
  '': LayoutDashboard,
  articles: FileText,
  products: ShoppingBag,
  categories: Tag,
  authors: Users
} satisfies Record<NavSegment, LucideIcon>;

function iconForSegment(segment: string): LucideIcon {
  if (!(segment in SEGMENT_ICONS)) {
    throw new Error(
      `SidebarNav: nenhum ícone mapeado para o segmento "${segment}".`
    );
  }
  return SEGMENT_ICONS[segment as NavSegment];
}

export function SidebarNav({ siteSlug }: SidebarNavProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const drawerId = useId();
  const previousPathnameRef = useRef(pathname);

  // Fecha o drawer só quando a navegação realmente ocorre (pathname
  // muda), nunca no clique do link — ver doc comment acima. A ref já
  // nasce com o pathname da montagem, então esta primeira execução nunca
  // fecha nada.
  useEffect(() => {
    if (pathname !== previousPathnameRef.current) {
      previousPathnameRef.current = pathname;
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }
    } else {
      previousPathnameRef.current = pathname;
    }
  }, [pathname]);

  // Fecha o drawer ao entrar em `lg+` enquanto ele está aberto — ver doc
  // comment acima. `typeof window.matchMedia === 'function'` só protege o
  // ambiente de teste (jsdom não implementa `matchMedia` nesta suíte); em
  // qualquer navegador real é sempre verdadeiro.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const desktopQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);

    function handleDesktopChange(event: MediaQueryListEvent) {
      if (event.matches && dialogRef.current?.open) {
        dialogRef.current.close();
      }
    }

    desktopQuery.addEventListener('change', handleDesktopChange);
    return () => {
      desktopQuery.removeEventListener('change', handleDesktopChange);
    };
  }, []);

  function renderNavList(listClassName: string): ReactNode {
    return (
      <ul className={listClassName}>
        {NAV_DESTINATIONS.map(item => {
          const href = navDestinationHref(siteSlug, item.segment);
          const isActive = isNavDestinationActive(pathname, href, item);
          const Icon = iconForSegment(item.segment);
          return (
            <li key={item.segment}>
              <GuardedLink
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-2 px-control-x py-control-y font-ui font-action text-body text-fg no-underline focus-visible:outline-none focus-visible:ring-2 ring-focus ${
                  isActive
                    ? 'rounded-pill bg-accent-subtle text-accent-subtle-fg'
                    : 'rounded-control'
                }`}
              >
                <Icon aria-hidden="true" className="shrink-0" />
                {item.label}
              </GuardedLink>
            </li>
          );
        })}
      </ul>
    );
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  }

  return (
    <>
      <div className="lg:hidden [grid-area:menu] flex items-center border-b border-[#e5e7eb] pl-6 pr-1">
        <button
          type="button"
          data-density="compact"
          className={`${HAMBURGER_CLASSES} lg:hidden [grid-area:menu] self-center inline-flex items-center gap-2`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={drawerId}
          onClick={() => {
            dialogRef.current?.showModal();
            setIsOpen(true);
          }}
        >
          <MenuIcon aria-hidden="true" className="shrink-0" />
          <span className="sr-only">Menu</span>
        </button>
      </div>

      <nav
        aria-label="Navegação do Site"
        data-density="compact"
        className="hidden lg:flex lg:[grid-area:rail] lg:flex-col lg:gap-4 lg:border-r lg:border-outline lg:p-3"
      >
        <span className="flex flex-col font-ui text-body-sm font-action leading-tight text-fg">
          <span>FastCompre</span>
          <span className="font-ui text-body-sm text-fg-muted tracking-wide">
            ADMIN
          </span>
        </span>
        {renderNavList('m-0 flex list-none flex-col gap-4 p-0')}
        <p className="m-0 mt-auto font-ui text-body-sm text-fg-muted">
          © 2026 FastCompre. Todos os direitos reservados.
        </p>
      </nav>

      <dialog
        id={drawerId}
        ref={dialogRef}
        aria-label="Menu de navegação"
        onClose={() => setIsOpen(false)}
        onClick={handleBackdropClick}
        className={styles.drawer}
      >
        <div className="flex items-center justify-between gap-4">
          <span className="flex flex-col font-ui text-body-sm font-action leading-tight text-fg">
            <span>FastCompre</span>
            <span className="font-ui text-body-sm text-fg-muted tracking-wide">
              ADMIN
            </span>
          </span>
          <button
            type="button"
            autoFocus
            className={`${BUTTON_CLASSES} shrink-0 inline-flex items-center`}
            onClick={() => dialogRef.current?.close()}
          >
            <X aria-hidden="true" />
            <span className="sr-only">Fechar menu</span>
          </button>
        </div>
        <nav aria-label="Navegação do Site">
          {renderNavList('m-0 flex list-none flex-col gap-1 p-0')}
        </nav>
      </dialog>
    </>
  );
}
