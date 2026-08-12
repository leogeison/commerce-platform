import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { z } from 'zod';
import { apiRequest } from './api-client';
import { AdminApiError } from './api-error';

/**
 * `NEXT_PUBLIC_API_URL` já vem fixado por `jest.setup.ts`
 * (`http://localhost:3000`) — suficiente para este arquivo, que não testa
 * `env.ts` (isso é `env.spec.ts`), só o comportamento HTTP do cliente.
 */

function mockFetchOnce(status: number, text: string | undefined) {
  global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text ?? ''),
  } as Response);
}

const itemSchema = z.object({ id: z.string(), name: z.string() });

describe('apiRequest', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GET: monta a URL por concatenação simples e sempre envia credentials: "include"', async () => {
    mockFetchOnce(200, JSON.stringify({ id: '1', name: 'Categoria' }));

    await apiRequest('/admin/sites/fastcompre/categories/1', itemSchema);

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/admin/sites/fastcompre/categories/1', {
      method: 'GET',
      credentials: 'include',
      headers: undefined,
      body: undefined,
    });
  });

  it('POST com body: define Content-Type e serializa o corpo, mantendo credentials: "include"', async () => {
    mockFetchOnce(201, JSON.stringify({ id: '1', name: 'Nova Categoria' }));

    await apiRequest('/admin/sites/fastcompre/categories', itemSchema, {
      method: 'POST',
      body: { name: 'Nova Categoria', slug: 'nova-categoria' },
    });

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/admin/sites/fastcompre/categories', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nova Categoria', slug: 'nova-categoria' }),
    });
  });

  it('2xx com corpo vazio e z.void(): resolve com sucesso, sem lançar', async () => {
    mockFetchOnce(204, '');

    await expect(apiRequest('/admin/auth/logout', z.void(), { method: 'POST' })).resolves.toBeUndefined();
  });

  it('2xx com corpo compatível com o schema: devolve os dados parseados', async () => {
    mockFetchOnce(200, JSON.stringify({ id: '1', name: 'Categoria' }));

    const result = await apiRequest('/admin/sites/fastcompre/categories/1', itemSchema);

    expect(result).toEqual({ id: '1', name: 'Categoria' });
  });

  it('2xx com corpo incompatível com o schema esperado: AdminApiError com code INVALID_RESPONSE_SHAPE', async () => {
    mockFetchOnce(200, JSON.stringify({ unexpected: true }));

    await expect(apiRequest('/admin/sites/fastcompre/categories/1', itemSchema)).rejects.toMatchObject({
      name: 'AdminApiError',
      statusCode: 200,
      code: 'INVALID_RESPONSE_SHAPE',
      message: 'Resposta da API não corresponde ao contrato esperado.',
    });
  });

  it('2xx com corpo textual/não-JSON: erro de resposta inválida (JSON esperado, não recebido)', async () => {
    mockFetchOnce(200, 'not-json');

    await expect(apiRequest('/admin/sites/fastcompre/categories/1', itemSchema)).rejects.toMatchObject({
      name: 'AdminApiError',
      statusCode: 200,
      code: undefined,
      message: 'Resposta da API não é um JSON válido.',
    });
  });

  it('não-2xx com JSON compatível com apiErrorSchema: usa message/code da API', async () => {
    mockFetchOnce(
      404,
      JSON.stringify({
        statusCode: 404,
        code: 'CATEGORY_NOT_FOUND',
        error: 'Not Found',
        message: 'Categoria não encontrada.',
      }),
    );

    await expect(apiRequest('/admin/sites/fastcompre/categories/1', itemSchema)).rejects.toMatchObject({
      name: 'AdminApiError',
      statusCode: 404,
      code: 'CATEGORY_NOT_FOUND',
      message: 'Categoria não encontrada.',
    });
  });

  it('não-2xx com JSON fora de apiErrorSchema: erro genérico contendo o status, sem code', async () => {
    mockFetchOnce(422, JSON.stringify({ unexpected: 'shape' }));

    await expect(apiRequest('/admin/sites/fastcompre/categories/1', itemSchema)).rejects.toMatchObject({
      name: 'AdminApiError',
      statusCode: 422,
      code: undefined,
      message: 'Erro ao chamar a API (status 422).',
    });
  });

  it('não-2xx com corpo vazio: erro genérico contendo o status, sem code', async () => {
    mockFetchOnce(500, '');

    await expect(apiRequest('/admin/sites/fastcompre/categories/1', itemSchema)).rejects.toMatchObject({
      name: 'AdminApiError',
      statusCode: 500,
      code: undefined,
      message: 'Erro ao chamar a API (status 500).',
    });
  });

  it('não-2xx com corpo não-JSON (ex.: "Internal Server Error"): erro genérico contendo o status, sem code — nunca "JSON inválido"', async () => {
    mockFetchOnce(500, 'Internal Server Error');

    const error = await apiRequest('/admin/sites/fastcompre/categories/1', itemSchema).catch((err) => err);

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({
      name: 'AdminApiError',
      statusCode: 500,
      code: undefined,
      message: 'Erro ao chamar a API (status 500).',
    });
  });
});
