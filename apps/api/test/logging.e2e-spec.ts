import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  LoggingModule,
  REQUEST_ID_HEADER,
} from '../src/shared/logging/logging.module';

/**
 * Controller só de teste: uma rota simples só para gerar uma requisição
 * HTTP real e inspecionar o header de correlação (INF-002).
 */
@Controller('test-logging')
class TestLoggingController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

describe('LoggingModule — request ID (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [LoggingModule],
      controllers: [TestLoggingController],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('gera um request ID automaticamente quando o header não vem na requisição', async () => {
    const response = await request(app!.getHttpServer()).get('/test-logging');

    const requestId = response.headers[REQUEST_ID_HEADER];
    expect(typeof requestId).toBe('string');
    expect(requestId.length).toBeGreaterThan(0);
  });

  it('reaproveita o x-request-id recebido e devolve o mesmo valor na resposta', async () => {
    const incomingId = 'meu-id-de-correlacao-fixo';

    const response = await request(app!.getHttpServer())
      .get('/test-logging')
      .set(REQUEST_ID_HEADER, incomingId);

    expect(response.headers[REQUEST_ID_HEADER]).toBe(incomingId);
  });
});
