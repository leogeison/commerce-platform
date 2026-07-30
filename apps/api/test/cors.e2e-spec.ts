import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { buildCorsOptions } from '../src/shared/http/cors.config';

const ALLOWED_ADMIN_ORIGIN = 'http://localhost:3001';

@Controller('test-cors')
class TestCorsController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

/**
 * Prova da INF-005: CORS restrito à origem exata do admin. `enableCors` é
 * uma chamada imperativa na instância da aplicação (não um provider), então
 * o teste aplica a mesma `buildCorsOptions` usada em `main.ts` diretamente
 * aqui — sem isso o `Test.createTestingModule` não teria CORS nenhum.
 */
describe('CORS restritivo (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestCorsController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableCors(buildCorsOptions(ALLOWED_ADMIN_ORIGIN));
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('permite a origem exata do admin, com credentials habilitado', async () => {
    const response = await request(app!.getHttpServer())
      .get('/test-cors')
      .set('Origin', ALLOWED_ADMIN_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(
      ALLOWED_ADMIN_ORIGIN,
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('bloqueia origem não autorizada — resposta não carrega header de CORS para ela', async () => {
    const response = await request(app!.getHttpServer())
      .get('/test-cors')
      .set('Origin', 'http://evil.example.com');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
