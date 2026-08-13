'use client';

import type { CategoryAdmin } from '@commerce-platform/contracts';
import styles from './category-read-only.module.css';

interface CategoryReadOnlyProps {
  category: CategoryAdmin;
}

const ACTIVE_LABEL = 'Ativa';
const ARCHIVED_LABEL = 'Arquivada';

/**
 * Composição somente leitura de Categoria (ADM-012), usada quando a Role do
 * usuário no Site atual é `VIEWER` — estrutural e visualmente distinta de
 * `CategoryForm` (mesmo princípio já aplicado a Artigo na ADM-010,
 * Architecture.md §32: "nunca a mesma tela com campos simplesmente
 * desabilitados — são composições visuais diferentes"). Nenhum `<input>`
 * aqui, nenhum botão de ciclo de vida.
 *
 * `category` já vem carregada por `CategoryDetail` — sem fetch próprio
 * (diferente de `ArticleReadOnly`, que resolve Categoria/Autor à parte
 * porque `ArticleAdmin` só tem os ids; `CategoryAdmin` já é o dado
 * completo).
 */
export function CategoryReadOnly({ category }: CategoryReadOnlyProps) {
  return (
    <div className={styles.view}>
      <h1>{category.name}</h1>

      <dl className={styles.summary}>
        <dt>Slug</dt>
        <dd>{category.slug}</dd>

        <dt>Status</dt>
        <dd>{category.archivedAt ? ARCHIVED_LABEL : ACTIVE_LABEL}</dd>
      </dl>
    </div>
  );
}
