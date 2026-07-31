import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { HttpModule } from '../../shared/http/http.module';
import { PASSWORD_HASHER } from './domain/password-hasher';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { CreateSessionUseCase } from './application/create-session.use-case';
import { LoginUseCase } from './application/login.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { AuthController } from './presentation/auth.controller';
import { SessionAuthGuard } from './presentation/session-auth.guard';

/**
 * Primeiro módulo de domínio real ligado ao `AppModule` (AUTH-005) — até
 * aqui, `tenancy` só existia como núcleo puro sem controller, e nenhum
 * módulo consumia `DatabaseModule` de verdade (ver README, Fases 1-4).
 *
 * `DatabaseModule` importado explicitamente aqui: embora seja `@Global()`,
 * precisa ser importado pelo menos uma vez em algum lugar da árvore de
 * módulos para que `PrismaService` fique disponível — este é esse lugar,
 * já que `PrismaUserRepository`/`CreateSessionUseCase` dependem dele.
 *
 * `Argon2PasswordHasher` ligado ao token `PASSWORD_HASHER` via factory
 * provider — a classe em si continua sem `@Injectable()`/import de
 * `@nestjs/*` (decisão da AUTH-002); quem sabe que a implementação é
 * Argon2id é só este módulo.
 *
 * `SessionAuthGuard` (AUTH-006) exportado de propósito: o objetivo da
 * tarefa é permitir `@UseGuards(SessionAuthGuard)` em qualquer rota
 * protegida, inclusive em outros módulos futuros (AUTH-007/008/009 e
 * módulos de domínio fora de `identity`) — sem `exports`, o Nest não deixa
 * injetá-lo fora deste módulo.
 */
@Module({
  imports: [DatabaseModule, HttpModule],
  controllers: [AuthController],
  providers: [
    PrismaUserRepository,
    CreateSessionUseCase,
    LoginUseCase,
    LogoutUseCase,
    SessionAuthGuard,
    {
      provide: PASSWORD_HASHER,
      useFactory: () => new Argon2PasswordHasher(),
    },
  ],
  exports: [SessionAuthGuard],
})
export class IdentityModule {}
