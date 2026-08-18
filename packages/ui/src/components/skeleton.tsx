/**
 * packages/ui/src/components/skeleton.tsx
 *
 * UXF-005 — primitive de estado (placeholder de carregamento).
 *
 * `aria-hidden="true"` é invariante: puramente decorativo/placeholder,
 * nunca deve ser anunciado por leitor de tela — quem comunica o estado de
 * carregamento real para tecnologia assistiva é o container consumidor
 * (`aria-busy`/`role="status"`), não o Skeleton em si.
 *
 * Garantia em runtime: `{...rest}` é espalhado ANTES de `aria-hidden="true"`
 * no JSX, então mesmo que `aria-hidden` chegue a existir dentro de `rest`
 * (ex.: chamador em JS puro, ou `as any`/`as unknown` no TS, que não passam
 * pela checagem de tipos), o atributo fixo sempre vence — comprovado por
 * teste (ver skeleton.spec.tsx).
 *
 * Garantia em tipagem: `Omit<React.HTMLAttributes<HTMLDivElement>,
 * 'aria-hidden'>` bloqueia `aria-hidden` em atribuições diretas de objeto
 * (`const p: SkeletonProps = { 'aria-hidden': ... }` — TS2353). NÃO bloqueia,
 * porém, o uso via JSX (`<Skeleton aria-hidden="false" />`): o TypeScript
 * isenta atributos JSX com hífen no nome (`aria-*`, `data-*` etc.) da
 * checagem de excesso de propriedades em componentes customizados — uma
 * limitação da linguagem, não do design deste componente (comprovado com
 * reprodução mínima isolada, sem Omit/HTMLAttributes/Skeleton). A garantia
 * real e incondicional do invariante é a de runtime acima.
 *
 * `motion-safe:animate-pulse` — utility nativa do Tailwind já condicionada
 * a `prefers-reduced-motion: no-preference`; em reduced-motion o Skeleton
 * fica estático, nunca pulsando. Sem token equivalente na UXF-001 (não é
 * decisão de design system, é comportamento estrutural de animação), por
 * isso não passa pela ponte.
 */
import * as React from 'react';

export type SkeletonVariant = 'text' | 'block' | 'circle';

export type SkeletonProps = {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'aria-hidden'>;

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  text: 'rounded-control',
  block: 'rounded-control',
  circle: 'rounded-pill',
};

export function Skeleton({
  variant = 'text',
  width,
  height,
  className,
  style,
  ...rest
}: SkeletonProps) {
  const classes = `bg-skeleton motion-safe:animate-pulse ${VARIANT_CLASSES[variant]}`;
  return (
    <div
      {...rest}
      aria-hidden="true"
      className={`${classes} ${className ?? ''}`.trim()}
      style={{ width, height, ...style }}
    />
  );
}
