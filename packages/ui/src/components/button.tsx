/**
 * packages/ui/src/components/button.tsx
 *
 * UXF-005 — primitive de ação.
 *
 * Só as variantes comprovadas necessárias agora: `primary` (ação
 * principal) e `secondary` (ação secundária) — sem `destructive`,
 * deliberadamente não antecipado para Categoria/UXA (ver investigação da
 * UXF-005).
 *
 * `<button>` nativo — foco (`focus-visible`), navegação por teclado e
 * `disabled` vêm gratuitamente do elemento HTML, sem reimplementação.
 * `type="button"` é o default real (evita submit acidental em formulário
 * quando o consumidor esquece de especificar) — passar `type="submit"`
 * (ou qualquer outro válido) explicitamente sobrescreve normalmente, sem
 * nenhuma lógica condicional escondida.
 *
 * `size` mapeia para o mesmo par tamanho/peso de texto que `Text` usa
 * (`text-body`/`text-body-sm`), reaproveitando a mesma ponte —
 * `sm` bate com os controles de paginação reais de Categoria (0.875rem),
 * `md` bate com o botão de submit real do formulário (1rem).
 *
 * Sem `cva`/`clsx` — lookup simples por variant/size, combinatória pequena
 * o bastante para não justificar uma lib de variantes.
 */
import * as React from 'react';

export type ButtonVariant = 'primary' | 'secondary';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent hover:bg-accent-hover active:bg-accent-active text-fg-on-accent',
  secondary: 'bg-surface border border-outline text-fg',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-body-sm',
  md: 'text-body',
};

export function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = `rounded-control font-ui font-action px-control-x py-control-y focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`;
  return (
    <button type={type} className={`${classes} ${className ?? ''}`.trim()} {...rest}>
      {children}
    </button>
  );
}
