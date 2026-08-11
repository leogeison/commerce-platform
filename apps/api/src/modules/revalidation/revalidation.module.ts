import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../../shared/config/config.module';
import type { EnvVars } from '../../shared/config/env.schema';
import { REVALIDATION_PORT } from './domain/revalidation.port';
import { HttpRevalidationAdapter } from './infrastructure/http-revalidation.adapter';

/**
 * Importa `AppConfigModule` diretamente (mesmo padrão de `HttpModule`):
 * garante `ConfigService` disponível mesmo em testes isolados que montam só
 * este módulo, sem o `AppModule` inteiro.
 *
 * Sem `controllers`/consumidor registrado aqui — quem primeiro precisar de
 * `REVALIDATION_PORT` importa este módulo.
 */
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: REVALIDATION_PORT,
      useFactory: (configService: ConfigService<EnvVars, true>) => {
        const targetUrl = configService.get('REVALIDATION_TARGET_URL', { infer: true });
        const secret = configService.get('REVALIDATION_SECRET', { infer: true });
        return new HttpRevalidationAdapter(targetUrl, secret);
      },
      inject: [ConfigService],
    },
  ],
  exports: [REVALIDATION_PORT],
})
export class RevalidationModule {}
