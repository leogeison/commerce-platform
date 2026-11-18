import {
  pickAllowedHeaders,
  serializeRequest,
  serializeResponse,
  toLoggablePath,
} from './log-serializers';

describe('log serializers (PROD-003)', () => {
  describe('serializeRequest', () => {
    const serializedByPino = {
      id: 'req-123',
      method: 'GET',
      url: '/r/fastcompre/offer-1?utm_source=x&token=query-secret',
      query: { utm_source: 'x', token: 'query-secret' },
      params: { siteSlug: 'fastcompre', offerId: 'offer-1' },
      remoteAddress: '203.0.113.9',
      remotePort: 54321,
      headers: {
        host: 'api.example.test',
        'user-agent': 'jest',
        'content-type': 'application/json',
        'content-length': '42',
        'x-request-id': 'req-123',
        cookie: 'admin_session=secret-token',
        authorization: 'Bearer secret',
        'x-real-ip': '203.0.113.9',
        'x-forwarded-for': '203.0.113.9, 10.0.0.1',
        'x-revalidation-secret': 'revalidation-secret',
        referer: 'https://admin.example.test/fastcompre/articles/1',
        'x-unknown-future': 'qualquer coisa',
      },
    };

    it('preserva id, method, pathname e params', () => {
      const result = serializeRequest(serializedByPino);

      expect(result.id).toBe('req-123');
      expect(result.method).toBe('GET');
      expect(result.url).toBe('/r/fastcompre/offer-1');
      expect(result.params).toEqual({ siteSlug: 'fastcompre', offerId: 'offer-1' });
    });

    it('parâmetros de query não aparecem no objeto serializado', () => {
      const json = JSON.stringify(serializeRequest(serializedByPino));

      expect(json).not.toContain('utm_source');
      expect(json).not.toContain('query-secret');
      expect(json).not.toContain('?');
    });

    it('mantém só os headers da allowlist', () => {
      expect(serializeRequest(serializedByPino).headers).toEqual({
        host: 'api.example.test',
        'user-agent': 'jest',
        'content-type': 'application/json',
        'content-length': '42',
        'x-request-id': 'req-123',
      });
    });

    it('não emite remoteAddress, remotePort nem query', () => {
      const result = serializeRequest(serializedByPino) as Record<string, unknown>;

      expect(result).not.toHaveProperty('remoteAddress');
      expect(result).not.toHaveProperty('remotePort');
      expect(result).not.toHaveProperty('query');
    });

    it('nenhum valor sensível sobrevive no JSON serializado', () => {
      const json = JSON.stringify(serializeRequest(serializedByPino));

      for (const sensitive of [
        'secret-token',
        'Bearer secret',
        '203.0.113.9',
        'revalidation-secret',
        'admin.example.test/fastcompre/articles',
        'qualquer coisa',
      ]) {
        expect(json).not.toContain(sensitive);
      }
    });

    it('headers ausentes geram objeto vazio', () => {
      expect(serializeRequest({ method: 'GET', url: '/' }).headers).toEqual({});
    });
  });

  describe('serializeResponse', () => {
    it('preserva statusCode e só os headers da allowlist (sem set-cookie nem location)', () => {
      const result = serializeResponse({
        statusCode: 302,
        headers: {
          'content-type': 'text/plain',
          'content-length': '0',
          'x-request-id': 'req-123',
          'set-cookie': ['admin_session=secret-token; HttpOnly'],
          location: 'https://marketplace.example/item?tag=affiliate-tag',
        },
      });

      expect(result).toEqual({
        statusCode: 302,
        headers: {
          'content-type': 'text/plain',
          'content-length': '0',
          'x-request-id': 'req-123',
        },
      });
    });
  });

  describe('toLoggablePath', () => {
    it.each([
      ['/r/fastcompre/offer-1?utm_source=x', '/r/fastcompre/offer-1'],
      ['/r/fastcompre/offer-1#fragmento', '/r/fastcompre/offer-1'],
      ['/r/fastcompre/offer-1?a=1#b', '/r/fastcompre/offer-1'],
      ['/r/fastcompre/offer-1', '/r/fastcompre/offer-1'],
      ['/', '/'],
    ])('%p → %p', (input, expected) => {
      expect(toLoggablePath(input)).toBe(expected);
    });

    it('url ausente continua ausente', () => {
      expect(toLoggablePath(undefined)).toBeUndefined();
    });
  });

  describe('pickAllowedHeaders', () => {
    it('compara nomes em minúsculas e normaliza a chave de saída', () => {
      expect(
        pickAllowedHeaders({ 'X-Request-Id': 'abc', 'X-Real-IP': '203.0.113.9' }, ['x-request-id']),
      ).toEqual({ 'x-request-id': 'abc' });
    });

    it('copia arrays de headers permitidos como estão e descarta arrays não permitidos', () => {
      expect(
        pickAllowedHeaders(
          { 'x-request-id': ['a', 'b'], 'set-cookie': ['s1', 's2'] },
          ['x-request-id'],
        ),
      ).toEqual({ 'x-request-id': ['a', 'b'] });
    });

    it('ignora valores undefined e tolera headers ausentes', () => {
      expect(pickAllowedHeaders({ host: undefined }, ['host'])).toEqual({});
      expect(pickAllowedHeaders(undefined, ['host'])).toEqual({});
    });
  });
});
