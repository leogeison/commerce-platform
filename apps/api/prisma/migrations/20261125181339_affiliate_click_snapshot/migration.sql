-- UXP-006 — dashboard de cliques: estado do clique no momento do evento.
-- Migration só aditiva: enum novo + três colunas OPCIONAIS em
-- "AffiliateClick". Sem preenchimento retroativo (eventos anteriores ficam
-- `NULL` = "não registrado"). Compatível com o código anterior (que não
-- envia as colunas) e com rollback da imagem da API. Sem índice novo: só
-- após medição (ver Post-Publication-Backlog.md, UXP-006).

-- CreateEnum
CREATE TYPE "AffiliateClickOutcome" AS ENUM ('REDIRECTED', 'OFFER_ARCHIVED');

-- AlterTable
ALTER TABLE "AffiliateClick" ADD COLUMN     "articleCategoryId" TEXT,
ADD COLUMN     "marketplace" "Marketplace",
ADD COLUMN     "outcome" "AffiliateClickOutcome";
