/**
 * apps/admin/src/app/[siteSlug]/articles/product-block/edit-command.ts
 *
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição.
 *
 * Comando Lexical dedicado, isolado neste módulo próprio para evitar
 * dependência circular entre `./node` (decorator do `ProductBlockNode`,
 * quem despacha o comando ao clicar em "Editar bloco de Produto
 * vinculado") e `../article-body-product-flow` (quem registra o handler e
 * abre o seletor de Produto já vinculado ao Artigo) — nenhum dos dois
 * arquivos importa o outro diretamente.
 */

import { createCommand, type LexicalCommand, type NodeKey } from 'lexical';

export interface OpenProductBlockEditPayload {
  nodeKey: NodeKey;
}

export const OPEN_PRODUCT_BLOCK_EDIT_COMMAND: LexicalCommand<OpenProductBlockEditPayload> = createCommand(
  'OPEN_PRODUCT_BLOCK_EDIT_COMMAND',
);
