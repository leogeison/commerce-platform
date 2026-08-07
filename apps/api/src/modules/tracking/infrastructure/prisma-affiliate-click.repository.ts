import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type {
  AffiliateClickRecorder,
  RecordAffiliateClickInput,
} from '../domain/affiliate-click-recorder';
import type { AffiliateClickExistenceChecker } from '../domain/affiliate-click-existence-checker';

/**
 * Implementação concreta (Prisma) de `AffiliateClickRecorder` (TRK-004) e,
 * desde TRK-010, também de `AffiliateClickExistenceChecker` — mesma classe,
 * mesma tabela (`AffiliateClick`), duas portas separadas (escrita/leitura).
 * `@Injectable()` de verdade — diferente de `Argon2PasswordHasher`
 * (AUTH-002), esta classe depende de `PrismaService` via DI, mesmo padrão
 * de `PrismaOfferRepository`/`PrismaArticleRepository`/`PrismaUserRepository`.
 *
 * `null` explícito nos campos ausentes (não a técnica de omitir a chave já
 * usada em `PrismaOfferRepository.create` para `currency`/`inStock`):
 * aquela existe só para campos com `@default(...)` no schema — os campos
 * opcionais de `AffiliateClick` não têm default, então `null` explícito é
 * o valor correto a persistir, não uma omissão que deixaria o Postgres
 * decidir algo que ele não tem como decidir.
 *
 * Sem `clickedAt` no `data`: `@default(now())` no schema.
 */
@Injectable()
export class PrismaAffiliateClickRepository
  implements AffiliateClickRecorder, AffiliateClickExistenceChecker
{
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAffiliateClickInput): Promise<void> {
    await this.prisma.affiliateClick.create({
      data: {
        siteId: input.siteId,
        offerId: input.offerId,
        articleId: input.articleId,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        referer: input.referer,
        userAgent: input.userAgent,
      },
    });
  }

  /**
   * `findFirst` (não `count`): só precisamos saber se existe ao menos um —
   * `findFirst` para no primeiro resultado, `count` varreria a tabela
   * inteira para a mesma resposta booleana.
   */
  async existsForOffer(siteId: string, offerId: string): Promise<boolean> {
    const click = await this.prisma.affiliateClick.findFirst({
      where: { siteId, offerId },
      select: { id: true },
    });

    return click !== null;
  }
}
