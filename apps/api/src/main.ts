import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildCorsOptions } from './shared/http/cors.config';
import type { EnvVars } from './shared/config/env.schema';

async function bootstrap() {
  // `bufferLogs: true` retém as mensagens de bootstrap do próprio Nest até
  // o logger do Pino estar pronto (senão essas primeiras linhas saem pelo
  // logger padrão do Nest, não em JSON).
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService<EnvVars, true>);
  app.enableCors(buildCorsOptions(configService.get('ADMIN_ORIGIN', { infer: true })));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
