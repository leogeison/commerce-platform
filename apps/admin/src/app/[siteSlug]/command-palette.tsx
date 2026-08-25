'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_DESTINATIONS, navDestinationHref, type NavDestination } from './nav-destinations';
import { useUnsavedChangesGuard } from './unsaved-changes-context';

interface CommandPaletteProps {
  id: string;
  siteSlug: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const INPUT_CLASSES =
  'w-full rounded-control border border-outline bg-surface px-control-x py-control-y text-body font-ui text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus';

const OPTION_BASE_CLASSES =
  'rounded-control px-control-x py-control-y text-body font-ui text-fg cursor-default';

const OPTION_ACTIVE_CLASSES = 'bg-outline';

const CLOSE_BUTTON_CLASSES =
  'shrink-0 rounded-control border border-outline bg-surface px-control-x py-control-y text-body-sm font-ui font-action text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus';

/**
 * Correspondência por subsequência ordenada, case-insensitive — não é
 * `includes()`: os caracteres da query precisam aparecer no rótulo na
 * mesma ordem, mas não necessariamente contíguos (ex.: "pdt" casa com
 * "Produtos"). Sem ranking — a ordem dos resultados é sempre a ordem de
 * `NAV_DESTINATIONS`, suficiente para os 4 itens deste escopo; nenhuma
 * pontuação de "melhor match primeiro" foi introduzida por não haver
 * necessidade real com uma lista deste tamanho.
 */
export function matchesQuery(label: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === '') {
    return true;
  }
  const normalizedLabel = label.toLowerCase();
  let queryIndex = 0;
  for (
    let labelIndex = 0;
    labelIndex < normalizedLabel.length && queryIndex < normalizedQuery.length;
    labelIndex++
  ) {
    if (normalizedLabel[labelIndex] === normalizedQuery[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === normalizedQuery.length;
}

/**
 * UXA-009 — Command Palette: escopo de Navegação.
 *
 * Estado controlado por `AuthenticatedShell` (ancestral comum de `Topbar`
 * e deste componente) — nenhum Context novo. `isOpen`/`onOpenChange` são
 * a única superfície externa; o listener global de teclado, a busca, a
 * navegação e o fechamento pós-navegação são inteiramente internos.
 *
 * `id` é recebido como prop (gerado por `useId()` em `AuthenticatedShell`)
 * só para permitir que `Topbar` aponte `aria-controls` para o `<dialog>`
 * real — a forma mínima de ligação explícita entre os dois sem criar
 * Context ou registro compartilhado: um único valor de string içado ao
 * ancestral comum, nada além disso.
 *
 * Destinos: mesma fonte de `SidebarNav` (`nav-destinations.ts`) — nunca
 * uma segunda lista. Só os 4 destinos com rota real hoje; Dashboard entra
 * junto de UXA-017, automaticamente, sem alteração estrutural aqui.
 *
 * `<dialog>` + `showModal()` — terceiro uso do mesmo padrão já provado em
 * `unsaved-changes-context.tsx` e `sidebar-nav.tsx`, incluindo o mesmo
 * polyfill de `jest.setup.ts`, sem alteração. Restauração de foco ao
 * fechar é sempre nativa (nenhuma chamada manual de `.focus()`), em todos
 * os caminhos — `Escape`, clique no backdrop, ou fechamento pós-navegação.
 *
 * Padrão combobox/listbox: o foco do DOM permanece sempre no `<input>`
 * (`autoFocus`, foco inicial nativo do `showModal()`); a navegação por
 * `ArrowDown`/`ArrowUp` só move `aria-activedescendant`, nunca o foco real
 * — é assim que o padrão WAI-ARIA "Combobox with List Autocomplete" evita
 * precisar de foco independente por opção. `Enter` ativa a opção
 * atualmente referenciada por `aria-activedescendant`.
 *
 * Reset de sessão determinístico (ajuste de revisão): `query`/`activeIndex`
 * são resetados durante a própria renderização — não num `useEffect` — na
 * transição de `isOpen` para `true`, usando o padrão documentado do React
 * para "ajustar estado em resposta a mudança de prop"
 * (https://react.dev/learn/you-might-not-need-an-effect). Isso garante que
 * a primeira renderização já comprometida no DOM depois da transição já
 * reflete `query === ''` e a primeira opção ativa — nenhum frame chega a
 * ser pintado com o estado da sessão anterior. Se o reset acontecesse
 * dentro de um `useEffect` que também chamasse `showModal()`, a chamada
 * síncrona a `showModal()` tornaria o diálogo visível antes da
 * re-renderização (assíncrona) que aplicaria o novo `query`/`activeIndex`
 * — exatamente o problema que este padrão evita.
 *
 * Navegação: `Enter`/clique num resultado chama `confirmLeave()`
 * (UXA-003) antes de `router.push()`. Se o usuário escolher "Ficar", a
 * Promise resolve `false`, nada acontece e a paleta permanece aberta. O
 * fechamento em si nunca acontece nesse handler — um `useEffect` próprio
 * observa `pathname` (mesmo mecanismo de `sidebar-nav.tsx`: uma ref guarda
 * o valor anterior, só fecha quando o valor muda de fato em relação à
 * renderização anterior) e só fecha o `<dialog>` quando a navegação
 * realmente ocorreu.
 *
 * Atalho global `Ctrl+K`/`Cmd+K` — aceita os dois em qualquer SO
 * (nenhuma detecção de plataforma), inclusive com foco em campo de
 * formulário (nenhuma combinação de teclas relevante do app usa essa
 * combinação hoje). Política de `preventDefault()` (ajuste de revisão):
 * não é o atalho → ignora, sem tocar em `preventDefault()`; paleta já
 * aberta → `preventDefault()` sem reabrir/resetar (evita o navegador
 * sequestrar o atalho enquanto a paleta segue em uso); outro `<dialog
 * open>` já presente no documento (drawer da UXA-008 ou confirmação de
 * saída da UXA-003) → ignora SEM `preventDefault()` — a paleta
 * deliberadamente não assume o comando, então não faz sentido bloquear o
 * atalho nativo do navegador/SO nesse caso; nenhum modal concorrente →
 * `preventDefault()` e abre. A consulta a `dialog[open]` só roda quando
 * `isOpen` (prop) já é `false`, e nesse momento o próprio `<dialog>` deste
 * componente nunca tem o atributo `open` (reflexo nativo de
 * `showModal()`/`close()`) — não pode se autobloquear.
 *
 * Botão "Fechar busca rápida" + wrap mínimo de `Tab` (achado empírico
 * desta revisão): o padrão combobox/listbox mantém o foco real do DOM só
 * no `<input>` — as opções da listbox nunca são tabbable (por desenho,
 * `aria-activedescendant` navega sem mover o foco). Isso deixava o
 * `<dialog>` com um único descendente nativamente focável. Confirmado
 * empiricamente em Chromium real (Playwright, headless): `<dialog
 * open>` nativo NÃO implementa um ciclo fechado de Tab entre seus
 * descendentes focáveis — ele só torna o conteúdo de fora inerte
 * (confirmado: o elemento que abre a paleta nunca é alcançável durante o
 * ciclo). Ao chegar no fim da sequência de foco alcançável, o navegador
 * cai em `document.body` antes de reiniciar a busca a partir do início do
 * documento no próximo `Tab` — com um único elemento focável, isso
 * acontecia a cada `Tab`. Testado empiricamente: adicionar só um segundo
 * elemento focável (sem nenhum wrap script) reduz a frequência (o salto
 * para `document.body` passa a ocorrer uma vez por volta completa, não a
 * cada tecla), mas não elimina — o padrão observado foi
 * `input → BODY → botão → input → BODY → botão → ...`, estável ao longo
 * de 15 pressionamentos consecutivos. Como o critério de aceite desta
 * correção é "nunca" (não "com menos frequência"), isso demonstra a
 * necessidade de um wrap mínimo, e não apenas do botão sozinho — por
 * isso `handleDialogKeyDown` intercepta exclusivamente as duas transições
 * de fronteira (`Tab` a partir do último elemento tabbable real desta
 * paleta — o botão — e `Shift+Tab` a partir do primeiro — o input),
 * devolvendo o foco ao outro extremo. Não é uma reimplementação genérica
 * de focus-trap: nenhum outro comportamento do `<dialog>` nativo é
 * alterado (inertização de fundo, `Escape`, fechamento por backdrop e
 * restauração de foco ao fechar continuam inteiramente nativos); os dois
 * `if` cobrem apenas as duas transições que o navegador não fecha sozinho
 * para o conjunto de exatamente dois elementos tabbable que esta paleta
 * possui. Itens da listbox permanecem deliberadamente não-tabbable — o
 * padrão combobox continua o mesmo, apenas com um destino adicional de
 * saída visível e acessível.
 */
export function CommandPalette({ id, siteSlug, isOpen, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { confirmLeave } = useUnsavedChangesGuard();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousPathnameRef = useRef(pathname);
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);

  // Reset síncrono durante a renderização — ver doc comment acima.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }

  const results = NAV_DESTINATIONS.filter((item) => matchesQuery(item.label, query));

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    }
  }, [isOpen]);

  // Fecha só quando a navegação realmente ocorre (pathname muda), nunca no
  // clique/Enter em si — mesmo mecanismo de `sidebar-nav.tsx`.
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

  // Atalho global — ver doc comment acima para a política de precedência.
  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut) {
        return;
      }
      if (isOpen) {
        event.preventDefault();
        return;
      }
      if (document.querySelector('dialog[open]')) {
        return;
      }
      event.preventDefault();
      onOpenChange(true);
    }

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isOpen, onOpenChange]);

  async function activateResult(destination: NavDestination | undefined) {
    if (!destination) {
      return;
    }
    if (!(await confirmLeave())) {
      return;
    }
    router.push(navDestinationHref(siteSlug, destination.segment));
  }

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setActiveIndex(0);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void activateResult(results[activeIndex]);
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  }

  // Wrap mínimo das duas transições de fronteira do Tab — ver doc comment
  // acima para o achado empírico que demonstra a necessidade.
  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') {
      return;
    }
    if (event.shiftKey) {
      if (document.activeElement === inputRef.current) {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    } else if (document.activeElement === closeButtonRef.current) {
      event.preventDefault();
      inputRef.current?.focus();
    }
  }

  function optionId(segment: string): string {
    return `${baseId}-option-${segment}`;
  }

  const activeDescendant = results[activeIndex] ? optionId(results[activeIndex].segment) : undefined;

  return (
    <dialog
      id={id}
      ref={dialogRef}
      aria-label="Busca rápida"
      className="m-auto w-[90vw] max-w-md rounded-control border border-outline bg-surface p-4"
      onClose={() => onOpenChange(false)}
      onClick={handleBackdropClick}
      onKeyDown={handleDialogKeyDown}
    >
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Buscar navegação
        </label>
        <input
          id={inputId}
          ref={inputRef}
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          placeholder="Buscar..."
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleInputKeyDown}
          className={`${INPUT_CLASSES} flex-1`}
        />
        <button
          type="button"
          ref={closeButtonRef}
          onClick={() => dialogRef.current?.close()}
          className={CLOSE_BUTTON_CLASSES}
        >
          Fechar busca rápida
        </button>
      </div>
      {results.length > 0 ? (
        <ul id={listboxId} role="listbox" aria-label="Destinos" className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
          {results.map((item, index) => (
            <li
              key={item.segment}
              id={optionId(item.segment)}
              role="option"
              aria-selected={index === activeIndex}
              className={`${OPTION_BASE_CLASSES} ${index === activeIndex ? OPTION_ACTIVE_CLASSES : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => void activateResult(item)}
            >
              {item.label}
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className="mt-2 text-body-sm font-ui text-fg-muted">
          Nenhum resultado encontrado
        </p>
      )}
    </dialog>
  );
}
