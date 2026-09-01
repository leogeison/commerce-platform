/**
 * `@testing-library/jest-dom/jest-globals` (não o entrypoint padrão
 * `@testing-library/jest-dom`) — os specs deste projeto importam `expect`
 * de `@jest/globals` (padrão já usado em `env.spec.ts`/`api-client.spec.ts`
 * desde ADM-001), não o global ambiente `jest`/`expect` clássico. A
 * augmentation de tipos (`toBeInTheDocument`, `toHaveTextContent`, etc.) só
 * se aplica à interface `Matchers` de `@jest/globals` através deste
 * entrypoint específico; o padrão (`@testing-library/jest-dom`) estende
 * apenas o namespace global `jest.Matchers`, que não é o que `tsc` resolve
 * aqui — sem isso, `tsc --noEmit` falha com "Property 'toBeInTheDocument'
 * does not exist" nos specs de componente.
 */
import '@testing-library/jest-dom/jest-globals';

/**
 * `jest-axe/extend-expect` (UXF-007) — diferente do jest-dom acima, o
 * `@types/jest-axe` amplia tanto `namespace jest { interface Matchers }`
 * (global clássico) quanto `declare module "@jest/expect" { interface
 * Matchers }` (o que `@jest/globals` resolve) no mesmo arquivo de tipos —
 * não existe um entrypoint alternativo equivalente a `/jest-globals` a
 * escolher aqui; este único import cobre o padrão `@jest/globals` deste
 * projeto (verificado por `tsc --strict --skipLibCheck false`).
 */
import 'jest-axe/extend-expect';

/**
 * Valor fixo de `NEXT_PUBLIC_API_URL` para toda a suíte, exceto
 * `env.spec.ts` (que testa a própria validação e sobrescreve `process.env`
 * por teste, com `jest.resetModules()` + import dinâmico — ver esse
 * arquivo). Executado por `setupFilesAfterEnv` (ADM-002; era `setupFiles`
 * na ADM-001) — necessário para que `@testing-library/jest-dom` estenda o
 * `expect` depois que o ambiente Jest já está instalado. `process.env`
 * continua sendo aplicado antes de qualquer arquivo de teste importar
 * `./env`, mesmo com essa troca — `setupFilesAfterEnv` roda depois do
 * ambiente, mas ainda antes do arquivo de teste em si.
 */
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';

/**
 * Polyfill restrito de `<dialog>` para `jsdom@26` (bundlado por
 * `jest-environment-jsdom@30.4.1`), que não implementa
 * `showModal`/`close`/o fechamento nativo via Escape nem a gestão de foco
 * que a spec exige (confirmado empiricamente: `HTMLDialogElement.prototype
 * .showModal` é `undefined` neste ambiente). Usado pelo diálogo de
 * confirmação da UXA-003 (`unsaved-changes-context.tsx`). Reproduz só o
 * contrato realmente consumido pelo componente e pelos testes:
 * - atributo `open`, `returnValue`, evento `close`;
 * - Escape disparando `cancel` cancelável antes de fechar;
 * - foco inicial movido para dentro do diálogo em `showModal()` (spec:
 *   primeiro elemento `[autofocus]`, senão o primeiro elemento focável,
 *   senão o próprio `<dialog>`) — sem isto, `autoFocus` no botão "Ficar"
 *   nunca teria efeito observável em jsdom;
 * - foco devolvido ao elemento que estava focado antes de `showModal()`,
 *   ao fechar — mesmo comportamento nativo de retorno de foco.
 * Nenhuma asserção de comportamento é enfraquecida por isto: os testes
 * continuam observando foco/`returnValue`/eventos reais, não um stub que
 * sempre "passa".
 */
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  const previouslyFocused = new WeakMap<HTMLDialogElement, HTMLElement>();

  const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      previouslyFocused.set(this, activeElement);
    }

    const autofocusTarget = this.querySelector<HTMLElement>('[autofocus]');
    const focusTarget = autofocusTarget ?? this.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusTarget) {
      focusTarget.focus();
    } else {
      if (!this.hasAttribute('tabindex')) {
        this.setAttribute('tabindex', '-1');
      }
      this.focus();
    }
  };

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
    if (returnValue !== undefined) {
      this.returnValue = returnValue;
    }
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));

    const elementToRestore = previouslyFocused.get(this);
    previouslyFocused.delete(this);
    if (elementToRestore && document.contains(elementToRestore)) {
      elementToRestore.focus();
    }
  };

  // Inicializa `returnValue` direto, sem guarda condicional: o tipo de
  // `lib.dom.d.ts` já declara essa propriedade como sempre presente, então
  // `'returnValue' in HTMLDialogElement.prototype` estreita para `never`
  // dentro de um `if` negado e quebra `tsc --noEmit`. Rodar 1x no setup,
  // antes de qualquer `<dialog>` ser usado, é seguro mesmo sem a guarda.
  HTMLDialogElement.prototype.returnValue = '';

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    const openDialog = document.querySelector('dialog[open]');
    if (!openDialog) {
      return;
    }
    const notPrevented = openDialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    if (notPrevented) {
      (openDialog as HTMLDialogElement).close();
    }
  });
}


/**
 * Polyfill restrito de `Range.prototype.getBoundingClientRect`/
 * `getClientRects` para jsdom (UXE-006). jsdom NÃO implementa essas duas
 * APIs em `Range` — só em `Element` (onde já retorna um retângulo zerado,
 * documentado e usado em toda a suíte). Isso é uma lacuna conhecida do
 * jsdom (não existe motor de layout real; ver a lista de partes do DOM não
 * implementadas pelo próprio projeto jsdom), não um comportamento de
 * produção: um navegador real sempre implementa `Range.getBoundingClientRect`.
 *
 * `@testing-library/user-event` e o próprio Lexical consultam essas APIs
 * para posicionar/mover o cursor dentro de um `contentEditable` (ex.:
 * `{End}`/`{Home}` do teclado simulado em `article-body-editor.spec.tsx`).
 * Sem o polyfill, isso falha com `TypeError: ... .getBoundingClientRect is
 * not a function` (ou o aviso correspondente de interação não confiável),
 * mesmo em cenários de conteúdo de uma única linha, onde a resposta real
 * de um navegador seria equivalente a "não há quebra de linha" — o mesmo
 * resultado que um retângulo zerado (uma única "linha" degenerada)
 * produz.
 *
 * Não altera nenhum comportamento de produção do `ArticleBodyEditor`/
 * `ChangeTrackerPlugin`/Lexical: o polyfill só preenche uma lacuna do
 * ambiente de teste, com o mesmo valor zerado que jsdom já usa para
 * `Element.prototype.getBoundingClientRect`.
 */
if (typeof Range !== 'undefined') {
  const zeroDOMRect = (): DOMRect => ({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON() {
      return this;
    },
  });

  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = zeroDOMRect;
  }

  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = function getClientRects(): DOMRectList {
      return {
        length: 0,
        item: () => null,
        *[Symbol.iterator]() {},
      } as DOMRectList;
    };
  }
}
