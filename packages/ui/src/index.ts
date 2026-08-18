/**
 * packages/ui — ponto de entrada público do pacote.
 *
 * UXF-005: primeiros primitives reais do design system. Substitui o
 * export type-only de prova da UXF-002 (`UiPackageSkeleton`), que existiu
 * só para comprovar a resolução do pacote como dependência de workspace —
 * ver git history / relatório de fechamento da UXF-002 para esse registro.
 *
 * Fronteira normativa do pacote: ver README.md. `src/probe.tsx`
 * (fixture técnica da UXF-004) permanece isolado no subpath
 * `@commerce-platform/ui/probe`, sem nenhuma relação de código com os
 * primitives abaixo.
 */
export { Text } from './components/text';
export type { TextProps, TextElement, TextVariant, TextTone } from './components/text';

export { Button } from './components/button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/button';

export { Skeleton } from './components/skeleton';
export type { SkeletonProps, SkeletonVariant } from './components/skeleton';
