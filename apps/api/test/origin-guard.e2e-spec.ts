import {
  Controller,
  Delete,
  Get,
  INestApplication,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HttpModule } from '../src/shared/http/http.module';
import { OriginGuard } from '../src/shared/http/origin.guard';

// Precisa bater com o fallback de `ADMIN_ORIGIN` em `jest-e2e.setup.ts`,
// já que o `OriginGuard` lê o valor real via `ConfigService`.
const ADMIN_ORIGIN = 'http://localhost:3001';

@Controller('test-origin')
@UseGuards(OriginGuard)
class TestOriginController {
  @Get()
  read(): { ok: true } {
    return { ok: true };
  }

  @Post()
  create(): { created: true } {
    return { created: true };
  }

  @Patch()
  update(): { updated: true } {
    return { updated: true };
  }

  @Delete()
  remove(): { removed: true } {
    return { removed: true };
  }
}

describe('OriginGuard (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      controllers: [TestOriginController],
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

  it('GET não é afetado pelo guard, mesmo sem Origin', async () => {
    const response = await request(app!.getHttpServer()).get('/test-origin');
    expect(response.status).toBe(200);
  });

  it('POST sem Origin nem Referer é rejeitado (403)', async () => {
    const response = await request(app!.getHttpServer()).post('/test-origin');
    expect(response.status).toBe(403);
  });

  it('POST com Origin cross-site é rejeitado (403)', async () => {
    const response = await request(app!.getHttpServer())
      .post('/test-origin')
      .set('Origin', 'http://evil.example.com');

    expect(response.status).toBe(403);
  });

  it('POST com a Origin correta do admin passa', async () => {
    const response = await request(app!.getHttpServer())
      .post('/test-origin')
      .set('Origin', ADMIN_ORIGIN);

    expect(response.status).toBe(201);
  });

  it('PATCH e DELETE também exigem a Origin correta', async () => {
    const patchBlocked = await request(app!.getHttpServer()).patch(
      '/test-origin',
    );
    const deleteBlocked = await request(app!.getHttpServer()).delete(
      '/test-origin',
    );

    expect(patchBlocked.status).toBe(403);
    expect(deleteBlocked.status).toBe(403);

    const patchAllowed = await request(app!.getHttpServer())
      .patch('/test-origin')
      .set('Origin', ADMIN_ORIGIN);

    expect(patchAllowed.status).toBe(200);
  });

  it('Referer é aceito quando Origin está ausente (fallback)', async () => {
    const response = await request(app!.getHttpServer())
      .post('/test-origin')
      .set('Referer', `${ADMIN_ORIGIN}/some/admin/page`);

    expect(response.status).toBe(201);
  });
});
