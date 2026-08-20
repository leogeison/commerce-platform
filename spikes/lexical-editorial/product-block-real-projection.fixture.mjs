/**
 * spikes/lexical-editorial/product-block-real-projection.fixture.mjs
 *
 * UXE-004 — Round-trip 2.
 *
 * DADOS REAIS DE AMBIENTE DE DESENVOLVIMENTO/TESTE — não são fixture
 * sintética. É uma FOTOGRAFIA (snapshot) para reprodução offline do runner
 * deste spike, congelada a partir de uma consulta SQL somente-leitura
 * (`BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK;`) executada localmente
 * pelo usuário em 2026-08-20 contra o banco de desenvolvimento real do
 * FastCompre, sobre os models `Article`/`ArticleProduct`/`Product`/`Offer`
 * aprovados em `Architecture.md` (seção 27). O resultado bruto da consulta
 * foi entregue como `uxe-004-real-projection.json` (artefato operacional
 * temporário, na raiz do repositório) — este arquivo NÃO importa esse JSON
 * em runtime e NÃO deve ser commitado; os valores abaixo foram
 * transcritos manualmente a partir dele, um a um, sem transformação.
 *
 * `description` e `imageUrl` não fazem parte deste snapshot (a consulta que
 * o gerou não os selecionou) — ficam `null`, explicitamente marcados como
 * "não coletado nesta consulta", nunca inventados.
 *
 * Escopo dos dados congelados — exatamente o necessário definido na
 * consolidação da UXE-004, decisão 4:
 *
 *   1. A projeção real principal: o artigo `jbl-tune-520bt-vale-a-pena`,
 *      com seus dois `ArticleProduct` reais e as Ofertas reais de cada um.
 *      Usada nos cenários de sucesso (render com dado real) e nos cenários
 *      de blocos repetidos.
 *
 *   2. Um Produto real, existente, mas explicitamente NÃO vinculado ao
 *      artigo JBL — `Carregador USB-C 65W GaN`
 *      (33ea36d0-58f1-4228-9bcf-78828324d080), de fato vinculado a um
 *      OUTRO artigo real (`carregador-usb-c-65w-gan-vale-a-pena`). Usado
 *      para provar resolução `not-found` contra um `productId` real, sem
 *      lookup global — nunca contra um UUID inventado, que provaria menos.
 *
 * Isolamento de Site — ajuste explícito da consolidação (decisão de
 * ajuste desta rodada): TODOS os registros disponíveis no ambiente de
 * desenvolvimento pertencem ao mesmo `siteId`
 * (91a97052-6312-42de-b466-5d469e25717b). Nenhum segundo Site foi criado
 * para este spike. Por isso, a UXE-004 comprova empiricamente apenas
 * ISOLAMENTO POR ARTIGO/PROJEÇÃO (um productId real de outro artigo não
 * vaza para este). Isolamento de Site continua sendo uma propriedade
 * herdada do contrato/tenancy da API pública (`TenantContext`,
 * `PublicArticle.products[]` já escopado por Site+Artigo) — não é, e não
 * deve ser apresentado como, algo testado empiricamente por esta fixture.
 */

export const REAL_PROJECTION_SITE_ID = '91a97052-6312-42de-b466-5d469e25717b';

export const REAL_PROJECTION_ARTICLE_ID = '29c4577f-206d-4f57-8aef-eac60985f036';
export const REAL_PROJECTION_ARTICLE_SLUG = 'jbl-tune-520bt-vale-a-pena';

/**
 * Projeção estrutural real do artigo `jbl-tune-520bt-vale-a-pena` — mesma
 * forma (por Artigo, com `offers` aninhado) que `PublicArticle.products[]`
 * já expõe publicamente (`packages/contracts/src/public/articles/`).
 */
export const REAL_PROJECTION_BY_PRODUCT_ID = new Map([
  [
    '62888dfa-78da-47ac-a0fc-22189c048ef9',
    {
      productId: '62888dfa-78da-47ac-a0fc-22189c048ef9',
      name: 'Fone Bluetooth JBL Tune 520BT',
      description: null, // não coletado nesta consulta
      imageUrl: null, // não coletado nesta consulta
      position: 0,
      offers: [
        {
          offerId: '89531631-6932-4277-92c1-22a425cdb09f',
          marketplace: 'MERCADO_LIVRE',
          price: '243.00',
          currency: 'BRL',
          inStock: false,
        },
        {
          offerId: 'd499ce37-23f8-4acb-9668-3570aaf6362c',
          marketplace: 'AMAZON_BR',
          price: '220.00',
          currency: 'BRL',
          inStock: true,
        },
      ],
    },
  ],
  [
    'fc12d9ab-1b1d-4044-a5fb-35b53d809470',
    {
      productId: 'fc12d9ab-1b1d-4044-a5fb-35b53d809470',
      name: 'Fone XYZ Bluetooth',
      description: null, // não coletado nesta consulta
      imageUrl: null, // não coletado nesta consulta
      position: 1,
      offers: [
        {
          offerId: '47a761de-2bee-4965-be72-7402ed6d8d98',
          marketplace: 'AMAZON_BR',
          price: '199.90',
          currency: 'BRL',
          inStock: true,
        },
      ],
    },
  ],
]);

/**
 * Produto real, real, com Oferta real — porém vinculado a um artigo
 * DIFERENTE do artigo sob teste. Nunca presente em
 * `REAL_PROJECTION_BY_PRODUCT_ID` acima, de propósito.
 */
export const REAL_PRODUCT_NOT_LINKED_TO_TEST_ARTICLE = {
  productId: '33ea36d0-58f1-4228-9bcf-78828324d080',
  name: 'Carregador USB-C 65W GaN',
  linkedArticleId: '7bf1b6e2-3271-4ea4-a441-fb7f6f15341d',
  linkedArticleSlug: 'carregador-usb-c-65w-gan-vale-a-pena',
};

/**
 * Resolvedor de referência para os testes deste spike — SEMPRE escopado à
 * projeção de um único artigo, nunca a uma tabela global. É este contrato
 * de escopo, e não a implementação específica, que
 * `product-block-component.mjs`/`product-block-round-trip-full-cycle.mjs`
 * dependem: em produção, o equivalente seria `PublicArticle.products[]` já
 * resolvido pela API para o artigo/site corretos, nunca uma nova consulta
 * global disparada pelo bloco editorial.
 *
 * @param {Map<string, object>} projectionByProductId
 * @returns {(productId: string) => object | null}
 */
export function createScopedResolver(projectionByProductId) {
  return function resolveProduct(productId) {
    return projectionByProductId.get(productId) ?? null;
  };
}
