import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { SessionCookieHelper } from './session-cookie.helper';

/**
 * Registra o `AllExceptionsFilter` como filtro global via token `APP_FILTER`
 * (em vez de `app.useGlobalFilters()` em `main.ts`) para que o filtro valha
 * também nos testes que montam a aplicação via `Test.createTestingModule`,
 * sem depender do bootstrap real.
 *
 * Também expõe o `SessionCookieHelper` (INF-004) como provider injetável
 * para quando a lógica de sessão (Fase 5) existir.
 */
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    SessionCookieHelper,
  ],
  exports: [SessionCookieHelper],
})
export class HttpModule {}
