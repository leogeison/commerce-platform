'use client';

import { useProductLookup } from './product-lookup-context';
import styles from './article-form.module.css';

/**
 * apps/admin/src/app/[siteSlug]/articles/product-block-preview.tsx
 *
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição (preview Admin).
 *
 * Renderiza um segmento `'product-block'` (já validado por
 * `splitBodyIntoSegments`/`parseProductBlockBody`) resolvendo `productId`
 * contra a mesma fonte compartilhada do editor (`ProductLookupContext`) —
 * nenhum fetch próprio, nenhuma duplicação de dado de Produto/Oferta.
 * `:::product` nunca aparece como texto no preview, em nenhum dos estados
 * abaixo (fail-closed também aqui: nunca passthrough literal).
 */
interface ProductBlockPreviewProps {
  productId: string;
}

export function ProductBlockPreview({ productId }: ProductBlockPreviewProps) {
  const { resolveProduct } = useProductLookup();
  const resolution = resolveProduct(productId);

  if (resolution.status === 'loading') {
    return (
      <p role="status" className={styles.previewProductBlockLoading}>
        Carregando Produto vinculado...
      </p>
    );
  }

  if (resolution.status === 'not-found') {
    return (
      <p role="alert" className={styles.previewProductBlockError}>
        Produto vinculado não encontrado.
      </p>
    );
  }

  if (resolution.status === 'unavailable' || resolution.status === 'error') {
    return (
      <p role="alert" className={styles.previewProductBlockError}>
        Não foi possível carregar o Produto vinculado.
      </p>
    );
  }

  const { product } = resolution;
  return (
    <div className={styles.previewProductBlock} data-product-id={productId}>
      {product.name}
      {product.archivedAt ? ' (arquivado)' : ''}
    </div>
  );
}
