import type { ArticleStatus } from '@commerce-platform/contracts';
import type { ArticleType } from '@commerce-platform/contracts';

/**
 * Rótulos de apresentação de `status`/`type` de Artigo — só copy, não
 * fonte de verdade de valores válidos (isso continua sendo
 * `articleStatusSchema`/`articleTypeSchema`, sempre iterados diretamente
 * para montar opções de `<select>`, nunca uma lista própria aqui).
 *
 * Extraído de `ArticleList` (ADM-008) para `lib/` na ADM-009: passou a ter
 * um segundo consumidor real (`ArticleForm`) — mesmo critério que já
 * justificou mover `fetchAllCategories` na ADM-008.
 */
export const STATUS_LABELS: Record<ArticleStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING_REVIEW: 'Em revisão',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Arquivado',
};

export const TYPE_LABELS: Record<ArticleType, string> = {
  REVIEW: 'Review',
  COMPARISON: 'Comparativo',
  BUYING_GUIDE: 'Guia de compra',
  DEAL: 'Promoção',
};
