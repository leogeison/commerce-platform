import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema';

/**
 * Wrapper do ConfigModule oficial do NestJS: carrega `.env` (via cwd do
 * processo, ou seja, `apps/api/.env`), valida contra o schema Zod e falha
 * imediatamente a subida da aplicação se alguma variável obrigatória
 * estiver ausente ou inválida.
 *
 * Global (isGlobal: true) para que nenhum outro módulo precise reimportar
 * ConfigModule/ConfigService explicitamente.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
