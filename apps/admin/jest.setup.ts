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
