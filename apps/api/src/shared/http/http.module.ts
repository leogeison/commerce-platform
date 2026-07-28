import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * Registra o `AllExceptionsFilter` como filtro global via token `APP_FILTER`
 * (em vez de `app.useGlobalFilters()` em `main.ts`) para que o filtro valha
 * também nos testes que montam a aplicação via `Test.createTestingModule`,
 * sem depender do bootstrap real.
 */
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class HttpModule {}
