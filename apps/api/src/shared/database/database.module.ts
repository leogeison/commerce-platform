import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import { PrismaService } from './prisma.service';

/**
 * Expõe o `PrismaService` (PrismaClient injetável) para o resto da
 * aplicação. `@Global()` para que qualquer módulo possa injetar
 * `PrismaService` sem reimportar `DatabaseModule` explicitamente — mesmo
 * padrão já usado pelo `AppConfigModule` (DB-002).
 *
 * Escopo da DB-012: só a conexão. Nenhum repository concreto vive aqui —
 * isso entra por módulo de domínio nas fases seguintes (regra da Etapa 15).
 *
 * Ainda não importado em `AppModule`: nenhum módulo de domínio consome o
 * Prisma nesta fase do backlog, então essa integração fica para quando o
 * primeiro repository real existir.
 */
@Global()
@Module({
  imports: [AppConfigModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
