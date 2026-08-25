import type { ReactNode } from 'react';
import { Text } from '@commerce-platform/ui';

interface AsyncStateProps {
  children: ReactNode;
}

/**
 * Três estados assíncronos compartilhados entre features de CRUD do Admin
 * (UXA-001, provado em Categoria; promovido para este nível em UXA-013 —
 * ver doc comment de `handleFileChange`/histórico da tarefa) — extraídos
 * da duplicação real já existente em `categories/category-list.tsx`/
 * `categories/[id]/category-detail.tsx`.
 *
 * Estritamente apresentacionais: recebem o conteúdo já resolvido pelo
 * consumidor (texto/nó) e não conhecem `AdminApiError`, `statusCode`,
 * `code` nem `BUSINESS_ERROR_STATUS_CODES` — a decisão de qual mensagem
 * mostrar (erro de negócio vs. genérico) continua em cada consumidor, via
 * `resolveErrorMessage`, sem alteração nesta tarefa.
 *
 * UXA-013 — promoção de `categories/async-state.tsx` para
 * `apps/admin/src/app/[siteSlug]/async-state.tsx` (irmão direto de
 * `categories/`/`products/`/`authors/`/`articles/`), não criação de uma
 * segunda implementação: nenhuma linha de código dos três componentes
 * muda, só a localização. Mesmo nível já usado por `site-role-context.tsx`/
 * `toast-context.tsx`/`unsaved-changes-context.tsx`/`guarded-link.tsx` —
 * todos com 2+ consumidores reais entre as quatro features de CRUD antes
 * mesmo desta tarefa (`useSiteRole`, por exemplo, já era importado de
 * `../site-role-context` por `products/`, `authors/` e `articles/`).
 *
 * Decisão explícita desta tarefa: NÃO promovido a `packages/ui`. Embora os
 * três componentes não conheçam nenhum conceito de domínio (candidatos
 * teoricamente genéricos), `packages/ui` está reservado a reuso comprovado
 * entre APPS (`apps/admin` e `apps/fastcompre`) — nenhum consumidor real em
 * `apps/fastcompre` existe hoje. Promover agora seria abstração antecipada
 * sem o segundo app como consumidor comprovado, o mesmo princípio que já
 * impediu a promoção precoce em UXA-001. O nível intermediário
 * (`[siteSlug]/`) resolve exatamente o problema real comprovado agora —
 * segundo consumidor dentro do Admin (Produto) — sem alcançar uma
 * fronteira maior do que a evidência sustenta.
 *
 * UXA-005 — apresentação usa o primitive `Text` (`packages/ui`,
 * variant="body", tone="primary" por padrão) mantendo exatamente a mesma
 * semântica de elemento (`<p>`) e o mesmo `role="alert"` em `ErrorState`.
 * `className="m-0"` reproduz o `margin: 0` do CSS Module original, que
 * `Text` não zera por padrão.
 */
export function LoadingState({ children }: AsyncStateProps) {
  return <Text className="m-0">{children}</Text>;
}

/**
 * `role="alert"` é o próprio critério de acessibilidade desta tarefa —
 * região assertiva, anunciada por leitor de tela assim que o texto entra
 * no DOM, mesmo comportamento já usado nos pontos duplicados que esta
 * extração substitui.
 */
export function ErrorState({ children }: AsyncStateProps) {
  return (
    <Text role="alert" className="m-0">
      {children}
    </Text>
  );
}

/**
 * Só usado por coleções (`CategoryList`, `ProductList`) — o detalhe de um
 * recurso único não tem noção de "vazio".
 */
export function EmptyState({ children }: AsyncStateProps) {
  return <Text className="m-0">{children}</Text>;
}
