import { Writable } from 'node:stream';
import {
  Controller,
  Get,
  INestApplication,
  Logger as NestLogger,
  Param,
  Res,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { Logger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  LoggingModule,
  pinoHttpOptions,
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

/**
 * PROD-003 — valores-sentinela: se qualquer um deles aparecer em qualquer
 * lugar do texto bruto dos logs, um dado sensível vazou.
 */
const SENTINEL = {
  cookie: 'SENTINEL-COOKIE-SESSION-TOKEN',
  authorization: 'SENTINEL-AUTHORIZATION-BEARER',
  xRealIp: '203.0.113.77',
  xForwardedFor: '198.51.100.66',
  revalidationSecret: 'SENTINEL-REVALIDATION-SECRET',
  referer: 'SENTINEL-REFERER-PATH',
  unknownHeader: 'SENTINEL-UNKNOWN-HEADER',
  setCookie: 'SENTINEL-SET-COOKIE-TOKEN',
  location: 'SENTINEL-LOCATION-AFFILIATE-TAG',
  query: 'SENTINEL-QUERY-TOKEN',
} as const;

const REQUEST_ERROR_MESSAGE = 'prod-003 log de erro dentro da requisição';

/**
 * Controller só de teste: simula uma resposta com `Set-Cookie` (como o
 * login) e um redirect com `Location` (como o `/r/` de afiliado), e emite um
 * `logger.error(...)` dentro da requisição — mesmo caminho usado pelo
 * `AllExceptionsFilter` e pelos casos de uso de revalidação.
 */
@Controller('test-logging-sensitive')
class SensitiveLoggingController {
  private readonly logger = new NestLogger(SensitiveLoggingController.name);

  @Get(':offerId')
  redirect(@Param('offerId') offerId: string, @Res() res: Response): void {
    this.logger.error({ offerId }, REQUEST_ERROR_MESSAGE);
    res.setHeader('Set-Cookie', `admin_session=${SENTINEL.setCookie}; HttpOnly; Secure`);
    res.redirect(302, `https://marketplace.example/item?tag=${SENTINEL.location}`);
  }
}

class MemoryLogStream extends Writable {
  readonly chunks: string[] = [];

  override _write(chunk: Buffer, _encoding: string, callback: () => void): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  get text(): string {
    return this.chunks.join('');
  }

  lines(): Array<Record<string, unknown>> {
    return this.text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('timeout aguardando a linha de log');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('LoggingModule — dados sensíveis fora dos logs (PROD-003, e2e)', () => {
  let app: INestApplication<App> | undefined;
  let stream: MemoryLogStream;

  beforeEach(async () => {
    stream = new MemoryLogStream();
    // Mesmas opções do `LoggingModule` (genReqId + serializers), só com o
    // destino trocado por um stream em memória.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [LoggerModule.forRoot({ pinoHttp: [pinoHttpOptions, stream] })],
      controllers: [SensitiveLoggingController],
    }).compile();

    app = moduleFixture.createNestApplication({ bufferLogs: true });
    // Mesmo roteamento do `main.ts`: `Logger` do `@nestjs/common` → Pino.
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function sendSensitiveRequest(requestId: string) {
    const response = await request(app!.getHttpServer())
      .get(`/test-logging-sensitive/offer-123?token=${SENTINEL.query}&utm_source=x`)
      .set(REQUEST_ID_HEADER, requestId)
      .set('Cookie', `admin_session=${SENTINEL.cookie}`)
      .set('Authorization', `Bearer ${SENTINEL.authorization}`)
      .set('X-Real-IP', SENTINEL.xRealIp)
      .set('X-Forwarded-For', `${SENTINEL.xForwardedFor}, 10.0.0.1`)
      .set('X-Revalidation-Secret', SENTINEL.revalidationSecret)
      .set('Referer', `https://admin.example.test/${SENTINEL.referer}`)
      .set('X-Unknown-Future', SENTINEL.unknownHeader)
      .redirects(0);

    await waitFor(() => stream.text.includes('request completed'));
    return response;
  }

  it('nenhum valor sensível aparece no texto bruto de nenhuma linha de log', async () => {
    const response = await sendSensitiveRequest('prod-003-raw-text');

    // Sanidade: a resposta realmente carregou os headers sensíveis.
    expect(response.status).toBe(302);
    expect(response.headers['location']).toContain(SENTINEL.location);
    expect(String(response.headers['set-cookie'])).toContain(SENTINEL.setCookie);

    for (const value of Object.values(SENTINEL)) {
      expect(stream.text).not.toContain(value);
    }
  });

  it('o logger.error emitido dentro da requisição carrega o req filtrado, sem sentinelas', async () => {
    await sendSensitiveRequest('prod-003-in-request');

    const errorLine = stream.lines().find((line) => line.msg === REQUEST_ERROR_MESSAGE);
    expect(errorLine).toBeDefined();

    const req = errorLine!.req as Record<string, unknown>;
    expect(req.id).toBe('prod-003-in-request');
    expect(req).not.toHaveProperty('remoteAddress');
    expect(req).not.toHaveProperty('remotePort');
    expect(req).not.toHaveProperty('query');

    const serialized = JSON.stringify(errorLine);
    for (const value of Object.values(SENTINEL)) {
      expect(serialized).not.toContain(value);
    }
  });

  it('preserva método, URL, params, status, responseTime e request ID na linha "request completed"', async () => {
    await sendSensitiveRequest('prod-003-observability');

    const completed = stream.lines().find((line) => line.msg === 'request completed');
    expect(completed).toBeDefined();

    const req = completed!.req as Record<string, unknown>;
    const res = completed!.res as Record<string, unknown>;

    expect(req.id).toBe('prod-003-observability');
    expect(req.method).toBe('GET');
    expect(req.url).toBe('/test-logging-sensitive/offer-123');
    expect(req).toHaveProperty('params');
    expect(res.statusCode).toBe(302);
    expect(typeof completed!.responseTime).toBe('number');

    expect(req.headers).toEqual(
      expect.objectContaining({ [REQUEST_ID_HEADER]: 'prod-003-observability' }),
    );
    expect(Object.keys(req.headers as object).sort()).toEqual(
      expect.arrayContaining(['host', REQUEST_ID_HEADER]),
    );
    expect(Object.keys(req.headers as object).every((name) =>
      ['host', 'user-agent', 'content-type', 'content-length', REQUEST_ID_HEADER].includes(name),
    )).toBe(true);

    expect(res.headers).toEqual(
      expect.objectContaining({ [REQUEST_ID_HEADER]: 'prod-003-observability' }),
    );
    expect(Object.keys(res.headers as object).every((name) =>
      ['content-type', 'content-length', REQUEST_ID_HEADER].includes(name),
    )).toBe(true);
  });
});
