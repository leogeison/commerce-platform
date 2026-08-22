import type { ReactNode } from 'react';
import styles from './async-state.module.css';

interface AsyncStateProps {
  children: ReactNode;
}

/**
 * Três estados assíncronos compartilhados entre a lista e o detalhe de
 * Categoria (UXA-001) — extraídos da duplicação real já existente em
 * `category-list.tsx`/`[id]/category-detail.tsx` (e replicada, de forma
 * independente, em `article-products-section.tsx`, que não é tocado por
 * esta tarefa: serviu só como evidência da necessidade).
 *
 * Estritamente apresentacionais: recebem o conteúdo já resolvido pelo
 * consumidor (texto/nó) e não conhecem `AdminApiError`, `statusCode`,
 * `code` nem `BUSINESS_ERROR_STATUS_CODES` — a decisão de qual mensagem
 * mostrar (erro de negócio vs. genérico) continua em cada consumidor, via
 * `resolveErrorMessage`, sem alteração nesta tarefa.
 *
 * Local a `apps/admin/src/app/[siteSlug]/categories/` por decisão do
 * backlog (UXA-001) — promoção para `packages/ui` só é avaliada quando
 * UXA-013 comprovar um segundo consumidor real (ver UXA-005). Um único
 * módulo com os três exports, sem fragmentação em arquivos separados:
 * decisão explícita desta rodada para não antecipar a organização física
 * que uma eventual promoção futura exigiria.
 */
export function LoadingState({ children }: AsyncStateProps) {
  return <p className={styles.status}>{children}</p>;
}

/**
 * `role="alert"` é o próprio critério de acessibilidade desta tarefa —
 * região assertiva, anunciada por leitor de tela assim que o texto entra
 * no DOM, mesmo comportamento já usado nos pontos duplicados que esta
 * extração substitui.
 */
export function ErrorState({ children }: AsyncStateProps) {
  return (
    <p role="alert" className={styles.status}>
      {children}
    </p>
  );
}

/**
 * Só usado por coleções (hoje, exclusivamente `CategoryList`) — o
 * detalhe de um recurso único não tem noção de "vazio".
 */
export function EmptyState({ children }: AsyncStateProps) {
  return <p className={styles.status}>{children}</p>;
}
