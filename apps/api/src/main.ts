import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  // `bufferLogs: true` retém as mensagens de bootstrap do próprio Nest até
  // o logger do Pino estar pronto (senão essas primeiras linhas saem pelo
  // logger padrão do Nest, não em JSON).
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
