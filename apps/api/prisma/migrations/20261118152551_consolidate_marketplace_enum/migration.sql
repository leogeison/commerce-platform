-- Revisão do enum Marketplace (lista final aprovada pelo PO):
--   AMAZON_BR   -> AMAZON (renomeado)
--   AMAZON_INTL -> AMAZON (consolidado; distinção BR/INTL aceita como perdida no enum)
--   + SHOPEE, MAGALU, HOTMART, BRAIP, KIWIFY (novos)
--
-- O PostgreSQL não remove valor de enum (`ALTER TYPE ... DROP VALUE` não
-- existe), e a migration gerada automaticamente pelo Prisma faria um cast
-- direto que falha com linhas `AMAZON_BR`/`AMAZON_INTL`. Por isso o tipo é
-- recriado e cada valor antigo é mapeado explicitamente no `USING`.
--
-- Atomicidade explícita (BEGIN/COMMIT): criar o tipo novo, converter a
-- coluna, remover o tipo antigo e renomear o novo acontecem juntos ou não
-- acontecem — uma falha em qualquer passo reverte tudo, sem coluna órfã nem
-- tipo intermediário. Só a coluna `Offer.marketplace` usa este enum; `id`,
-- preço, moeda, link e o histórico de `AffiliateClick` (FK por `id`) ficam
-- intocados.

BEGIN;

CREATE TYPE "Marketplace_new" AS ENUM (
  'AMAZON',
  'MERCADO_LIVRE',
  'SHOPEE',
  'ALIEXPRESS',
  'MAGALU',
  'HOTMART',
  'BRAIP',
  'KIWIFY'
);

ALTER TABLE "Offer"
  ALTER COLUMN "marketplace" TYPE "Marketplace_new"
  USING (
    CASE "marketplace"::text
      WHEN 'AMAZON_BR' THEN 'AMAZON'
      WHEN 'AMAZON_INTL' THEN 'AMAZON'
      ELSE "marketplace"::text
    END
  )::"Marketplace_new";

DROP TYPE "Marketplace";

ALTER TYPE "Marketplace_new" RENAME TO "Marketplace";

COMMIT;
