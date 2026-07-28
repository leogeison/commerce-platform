import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { EnvVars } from '../config/env.schema';

/**
 * Provider único do PrismaClient para toda a aplicação.
 *
 * Prisma 7 (`prisma-client`, ver DB-004) não instancia mais o client
 * sozinho a partir da `datasource.url` do schema — exige um driver adapter
 * explícito. Para PostgreSQL isso é o `@prisma/adapter-pg`, que recebe a
 * connection string e assume a conexão real via `pg`.
 *
 * `onModuleInit`/`onModuleDestroy` cobrem o "conexão única, encerramento
 * gracioso" da DB-012: conecta uma vez quando o módulo sobe, falhando cedo
 * se o banco estiver inacessível, e fecha a conexão quando o módulo (ou a
 * aplicação) é destruído — sem isso, o processo poderia manter sockets TCP
 * abertos após o shutdown.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService<EnvVars, true>) {
    const adapter = new PrismaPg({
      connectionString: configService.get('DATABASE_URL', { infer: true }),
    });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
