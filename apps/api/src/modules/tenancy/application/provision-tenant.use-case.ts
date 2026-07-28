import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { Role } from '../../../generated/prisma/enums';

/**
 * `passwordHash` chega sempre pronto: nesta fase do backlog (DB-013) o
 * serviço de hash (AUTH-002) ainda não existe, então quem chama este caso
 * de uso passa um hash de fixture. O comando real de bootstrap, com hash de
 * verdade, é a AUTH-013 — que reaproveita este mesmo caso de uso.
 */
export interface ProvisionTenantInput {
  userEmail: string;
  userPasswordHash: string;
  userName?: string;
  siteSlug: string;
  siteName: string;
  siteDomain: string;
  siteLocale: string;
}

export interface ProvisionTenantResult {
  userId: string;
  siteId: string;
  siteUserId: string;
}

/**
 * Único ponto de criação de `Site` no MVP (Etapa 12 / DB-013). Nunca deve
 * ser exposto como endpoint HTTP — nem aqui, nem na AUTH-013.
 *
 * Cria `User + Site + SiteUser(OWNER)` numa única transação Prisma: ou os
 * três registros existem, ou nenhum existe. A "idempotência mínima" pedida
 * pelo backlog vem das constraints `@unique` já existentes no schema
 * (`User.email`, `Site.slug`, `Site.domain`) — uma segunda chamada com os
 * mesmos dados falha alto e limpo (violação de unicidade dentro da mesma
 * transação, revertendo tudo), em vez de criar duplicata silenciosa. Não é
 * um mecanismo de idempotência por chave própria — isso é explicitamente
 * fora do escopo desta tarefa (não é um comando pensado para produção).
 */
@Injectable()
export class ProvisionTenantUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.userEmail,
          passwordHash: input.userPasswordHash,
          name: input.userName,
        },
      });

      const site = await tx.site.create({
        data: {
          slug: input.siteSlug,
          name: input.siteName,
          domain: input.siteDomain,
          locale: input.siteLocale,
        },
      });

      const siteUser = await tx.siteUser.create({
        data: {
          userId: user.id,
          siteId: site.id,
          role: Role.OWNER,
        },
      });

      return { userId: user.id, siteId: site.id, siteUserId: siteUser.id };
    });
  }
}
