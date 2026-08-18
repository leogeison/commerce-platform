/**
 * packages/ui/src/components/text.tsx
 *
 * UXF-005 — primitive de tipografia/texto.
 *
 * API deliberadamente mínima, derivada do primeiro consumidor real
 * previsto (Categoria, apps/admin/src/app/[siteSlug]/categories/), não de
 * um catálogo especulativo de variantes:
 * - `as`: só 'p'/'span' — os dois elementos realmente usados hoje
 *   (mensagens de status/erro em <p>, contagem de página em <span>).
 * - `variant`: só 'body'/'body-sm' — os dois tamanhos reais observados
 *   (1rem no texto padrão, 0.875rem em .fieldError/.formError).
 * - `tone`: só 'primary'/'muted'/'danger' — os três papéis de cor
 *   realmente distintos hoje (texto padrão, mensagem de status/loading,
 *   mensagem de erro com role="alert").
 * Nenhum heading, nenhuma variante serif/accent, nenhum `as` de label —
 * sem necessidade concreta demonstrável nesta tarefa (ver investigação da
 * UXF-005). Extensão futura é barata quando um consumidor real pedir.
 *
 * Todas as classes de cor/tamanho/peso vêm da ponte
 * packages/ui/tokens/tailwind-theme.css — nenhum valor literal aqui.
 */
import * as React from 'react';

export type TextElement = 'p' | 'span';
export type TextVariant = 'body' | 'body-sm';
export type TextTone = 'primary' | 'muted' | 'danger';

export type TextProps = {
  as?: TextElement;
  variant?: TextVariant;
  tone?: TextTone;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>;

const VARIANT_CLASSES: Record<TextVariant, string> = {
  body: 'text-body',
  'body-sm': 'text-body-sm',
};

const TONE_CLASSES: Record<TextTone, string> = {
  primary: 'text-fg',
  muted: 'text-fg-muted',
  danger: 'text-fg-danger',
};

export function Text({
  as: Component = 'p',
  variant = 'body',
  tone = 'primary',
  className,
  children,
  ...rest
}: TextProps) {
  const classes = `font-ui font-body ${VARIANT_CLASSES[variant]} ${TONE_CLASSES[tone]}`;
  return (
    <Component className={`${classes} ${className ?? ''}`.trim()} {...rest}>
      {children}
    </Component>
  );
}
