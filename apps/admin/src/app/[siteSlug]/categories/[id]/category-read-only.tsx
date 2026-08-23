'use client';

import type { CategoryAdmin } from '@commerce-platform/contracts';

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
 *
 * UXA-005 — apresentação migrada de CSS Module para Tailwind v4 + tokens do
 * design system. `<h1>`/`<dl>`/`<dt>`/`<dd>` permanecem HTML nativo com
 * classes Tailwind locais: `Text` (`packages/ui`) só suporta `p`/`span`,
 * não representa nenhum destes elementos semânticos. `text-lg` (1.25rem) é
 * usado como exceção sancionada — não existe token de heading no design
 * system nesta tarefa, e é o valor exato já usado no CSS Module original.
 */
export function CategoryReadOnly({ category }: CategoryReadOnlyProps) {
  return (
    <div className="flex max-w-xs flex-col gap-6">
      <h1 className="m-0 font-ui text-lg">{category.name}</h1>

      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="font-ui font-action">Slug</dt>
        <dd className="m-0 font-ui">{category.slug}</dd>

        <dt className="font-ui font-action">Status</dt>
        <dd className="m-0 font-ui">{category.archivedAt ? ARCHIVED_LABEL : ACTIVE_LABEL}</dd>
      </dl>
    </div>
  );
}
