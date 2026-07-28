import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { z } from 'zod';
import { apiErrorSchema } from '@commerce-platform/contracts';
import { HttpModule } from '../src/shared/http/http.module';
import { ZodValidationPipe } from '../src/shared/http/zod-validation.pipe';

// Simula um schema de `packages/contracts` na sua versão "v1": só exige `name`.
const localSchemaV1 = z.object({ name: z.string().min(1) });

// Simula o MESMO contrato depois de evoluir ("v2"): passa a exigir também
// `price`. O controller e o `ZodValidationPipe` abaixo são código idêntico
// nas duas rotas — só o schema passado no construtor muda.
const localSchemaV2 = localSchemaV1.extend({
  price: z.number().positive(),
});

// Prova que o pipe devolve `result.data` (com default do Zod aplicado),
// nunca o body cru — `active` não vem no payload de teste, mas deve vir
// na resposta porque o Zod preenche o default durante o parse.
const schemaWithDefault = z.object({
  name: z.string().min(1),
  active: z.boolean().default(true),
});

// Schema aninhado, para provar que o path de um erro em campo profundo
// aparece por inteiro na mensagem (ex.: `profile.address.zip`).
const nestedSchema = z.object({
  profile: z.object({
    address: z.object({
      zip: z.string().min(1),
    }),
  }),
});

@Controller('test-validation')
class TestValidationController {
  @Post('v1')
  createV1(@Body(new ZodValidationPipe(localSchemaV1)) body: unknown) {
    return body;
  }

  @Post('v2')
  createV2(@Body(new ZodValidationPipe(localSchemaV2)) body: unknown) {
    return body;
  }

  @Post('with-default')
  createWithDefault(
    @Body(new ZodValidationPipe(schemaWithDefault)) body: unknown,
  ) {
    return body;
  }

  @Post('nested')
  createNested(@Body(new ZodValidationPipe(nestedSchema)) body: unknown) {
    return body;
  }

  // Rota que valida contra um schema REAL, exportado de fato por
  // `packages/contracts` (não um schema local inventado só para o teste).
  @Post('contract-error')
  createContractError(@Body(new ZodValidationPipe(apiErrorSchema)) body: unknown) {
    return body;
  }
}

describe('ZodValidationPipe (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      controllers: [TestValidationController],
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

  it('payload malformado retorna 422 com ApiError válido, antes de qualquer caso de uso', async () => {
    const response = await request(app!.getHttpServer())
      .post('/test-validation/v1')
      .send({});

    expect(response.status).toBe(422);

    const parsed = apiErrorSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);

    expect(response.body.statusCode).toBe(422);
    expect(response.body.code).toBe('UNPROCESSABLE_ENTITY');
    expect(response.body.error).toBe('UnprocessableEntityException');
    expect(response.body.message).toContain('name');
  });

  it('payload válido passa e chega ao handler normalmente', async () => {
    const response = await request(app!.getHttpServer())
      .post('/test-validation/v1')
      .send({ name: 'ok' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ name: 'ok' });
  });

  it('alterar o schema do contrato muda a validação sem tocar no pipe/controller', async () => {
    const responseV1 = await request(app!.getHttpServer())
      .post('/test-validation/v1')
      .send({ name: 'ok' });

    const responseV2 = await request(app!.getHttpServer())
      .post('/test-validation/v2')
      .send({ name: 'ok' });

    expect(responseV1.status).toBe(201);
    expect(responseV2.status).toBe(422);
    expect(apiErrorSchema.safeParse(responseV2.body).success).toBe(true);
    expect(responseV2.body.message).toContain('price');
  });

  it('devolve result.data do Zod (com default aplicado), nunca o body cru', async () => {
    const response = await request(app!.getHttpServer())
      .post('/test-validation/with-default')
      .send({ name: 'ok' }); // `active` não enviado — deve vir com o default

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ name: 'ok', active: true });
  });

  it('mensagem de erro inclui o path completo de campos aninhados', async () => {
    const response = await request(app!.getHttpServer())
      .post('/test-validation/nested')
      .send({ profile: { address: {} } });

    expect(response.status).toBe(422);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.message).toContain('profile.address.zip');
  });

  it('valida contra um schema REAL exportado por packages/contracts (apiErrorSchema)', async () => {
    const validPayload = {
      statusCode: 404,
      code: 'NOT_FOUND',
      error: 'Not Found',
      message: 'recurso não encontrado',
    };

    const okResponse = await request(app!.getHttpServer())
      .post('/test-validation/contract-error')
      .send(validPayload);

    expect(okResponse.status).toBe(201);
    expect(okResponse.body).toEqual(validPayload);

    const invalidResponse = await request(app!.getHttpServer())
      .post('/test-validation/contract-error')
      .send({ statusCode: 404 }); // faltam code, error, message

    expect(invalidResponse.status).toBe(422);
    expect(apiErrorSchema.safeParse(invalidResponse.body).success).toBe(true);
    expect(invalidResponse.body.message).toContain('code');
    expect(invalidResponse.body.message).toContain('error');
    expect(invalidResponse.body.message).toContain('message');
  });
});
