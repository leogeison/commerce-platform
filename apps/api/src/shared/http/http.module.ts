import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from '../config/config.module';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { OriginGuard } from './origin.guard';
import { SessionCookieHelper } from './session-cookie.helper';

/**
 * Registra o `AllExceptionsFilter` como filtro global via token `APP_FILTER`
 * (em vez de `app.useGlobalFilters()` em `main.ts`) para que o filtro valha
 * também nos testes que montam a aplicação via `Test.createTestingModule`,
 * sem depender do bootstrap real.
 *
 * `OriginGuard` (INF-006) **não** é global aqui de propósito: o backlog fala
 * em rotas "administrativas", e nem toda escrita da API futuramente será
 * administrativa (ex.: o redirect de clique de afiliado, público, também
 * escreve `AffiliateClick`, e nunca vai ter a Origin do admin). Ele fica
 * exportado como provider para cada controller administrativo aplicar
 * explicitamente via `@UseGuards(OriginGuard)` quando existir (Fase 5+).
 *
 * Importa `AppConfigModule` diretamente (mesmo padrão do `DatabaseModule`,
 * DB-012): garante que `ConfigService` exista sempre que `HttpModule` for
 * usado, mesmo em testes isolados que não montam o `AppModule` inteiro.
 *
 * Também expõe o `SessionCookieHelper` (INF-004) como provider injetável
 * para quando a lógica de sessão (Fase 5) existir.
 */
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    OriginGuard,
    SessionCookieHelper,
  ],
  exports: [OriginGuard, SessionCookieHelper],
})
export class HttpModule {}
