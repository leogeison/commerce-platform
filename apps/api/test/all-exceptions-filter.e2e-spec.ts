import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HttpModule } from '../src/shared/http/http.module';

/**
 * Controller só de teste: existe apenas para forçar, de propósito, um erro
 * não tratado e uma `HttpException` conhecida através de uma requisição
 * HTTP real — provando o `AllExceptionsFilter` (INF-001) fim a fim, sem
 * precisar de nenhuma rota real da aplicação nem de banco de dados.
 */
@Controller('test-errors')
class TestErrorsController {
  @Get('unhandled')
  throwUnhandled(): never {
    throw new Error('boom — erro interno não tratado, só para teste');
  }

  @Get('http-exception')
  throwHttpException(): never {
    throw new HttpException('recurso não encontrado', HttpStatus.NOT_FOUND);
  }

  @Get('http-exception-with-details')
  throwHttpExceptionWithDetails(): never {
    throw new HttpException(
      {
        message: 'validação falhou',
        details: { issues: ['CAMPO_A_INVALIDO', 'CAMPO_B_INVALIDO'] },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

describe('AllExceptionsFilter (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      controllers: [TestErrorsController],
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

  it('erro não tratado vira ApiError genérico (500, INTERNAL_ERROR), sem stack trace', async () => {
    const response = await request(app!.getHttpServer()).get(
      '/test-errors/unhandled',
    );

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      error: 'Internal Server Error',
      message: 'Ocorreu um erro inesperado.',
    });

    const rawBody = JSON.stringify(response.body);
    expect(rawBody).not.toContain('boom');
    expect(rawBody.toLowerCase()).not.toContain('.ts:');
  });

  it('HttpException conhecida preserva status e mensagem reais', async () => {
    const response = await request(app!.getHttpServer()).get(
      '/test-errors/http-exception',
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      error: 'HttpException',
      message: 'recurso não encontrado',
    });
  });

  it('HttpException com `details` no corpo encaminha `details` no ApiError', async () => {
    const response = await request(app!.getHttpServer()).get(
      '/test-errors/http-exception-with-details',
    );

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      statusCode: 422,
      code: 'UNPROCESSABLE_ENTITY',
      error: 'HttpException',
      message: 'validação falhou',
      details: { issues: ['CAMPO_A_INVALIDO', 'CAMPO_B_INVALIDO'] },
    });
  });
});
