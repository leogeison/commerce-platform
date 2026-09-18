/**
 * `setupFilesAfterEnv` (UXF-007; era `setupFiles` na UXF-008) — necessário
 * para que `jest-axe/extend-expect` chame `expect.extend(...)` depois que
 * o ambiente Jest já está instalado (mesmo motivo de `apps/admin`,
 * ADM-002). As variáveis de ambiente abaixo continuam sendo aplicadas
 * antes de qualquer arquivo de teste importar `./env` — `setupFilesAfterEnv`
 * roda depois do ambiente, mas ainda antes do arquivo de teste em si.
 */
import 'jest-axe/extend-expect';

process.env.SITE_SLUG = 'test-site';
process.env.API_URL = 'http://localhost:3000';
process.env.SITE_URL = 'http://localhost:3001';
process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';
process.env.REVALIDATION_SECRET = 'test-revalidation-secret-value';

/**
 * Polyfill restrito de `<dialog>` para jsdom (UXW-004) — reprodução
 * direta do mesmo polyfill já em produção em `apps/admin/jest.setup.ts`
 * (UXA-003), mesma versão de `jest-environment-jsdom` (`^30.0.0` nos dois
 * apps). jsdom não implementa `showModal`/`close`/o fechamento nativo via
 * Escape nem a gestão de foco que `category-nav.spec.tsx` exige
 * (confirmado empiricamente no Admin: `HTMLDialogElement.prototype
 * .showModal` é `undefined` neste ambiente). Usado pelo drawer mobile de
 * Categorias (`category-nav.tsx`). Reproduz só o contrato realmente
 * consumido pelo componente e pelos testes:
 * - atributo `open`, `returnValue`, evento `close`;
 * - Escape disparando `cancel` cancelável antes de fechar;
 * - foco inicial movido para dentro do diálogo em `showModal()` (spec:
 *   primeiro elemento `[autofocus]`, senão o primeiro elemento focável,
 *   senão o próprio `<dialog>`) — sem isto, `autoFocus` no botão "Fechar"
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
