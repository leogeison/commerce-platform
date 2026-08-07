import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from '../config/config.module';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { OriginGuard } from './origin.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitStore } from './rate-limit.store';
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
 *
 * `RateLimitGuard`/`RateLimitStore` (INF-007) seguem o mesmo padrão do
 * `OriginGuard`: providers comuns, exportados, **não** globais — só valem
 * onde forem anexados explicitamente via `@UseGuards(RateLimitGuard)` numa
 * rota que também tenha `@RateLimit(...)`. Aplicado em `POST
 * /admin/auth/login` (AUTH-005, `{ limit: 5, windowMs: 60_000 }`) e em `GET
 * /r/:siteSlug/:offerId` (TRK-007, `{ limit: 30, windowMs: 60_000 }`).
 */
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    OriginGuard,
    RateLimitGuard,
    RateLimitStore,
    SessionCookieHelper,
  ],
  exports: [OriginGuard, RateLimitGuard, RateLimitStore, SessionCookieHelper],
})
export class HttpModule {}
