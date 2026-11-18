import type { Request } from 'express';
import { resolveClientIp } from './client-ip';

function buildRequest(options: {
  ip?: string;
  remoteAddress?: string;
  xRealIp?: string | string[];
}): Request {
  const headers: Record<string, string | string[]> = {};
  if (options.xRealIp !== undefined) {
    headers['x-real-ip'] = options.xRealIp;
  }

  return {
    ip: options.ip,
    socket: { remoteAddress: options.remoteAddress },
    headers,
  } as unknown as Request;
}

describe('resolveClientIp', () => {
  describe('modo socket (default)', () => {
    it('usa request.ip', () => {
      expect(resolveClientIp(buildRequest({ ip: '10.0.0.1' }), 'socket')).toBe('10.0.0.1');
    });

    it('ignora completamente X-Real-IP, mesmo válido (sem spoofing fora do proxy confiável)', () => {
      const request = buildRequest({ ip: '10.0.0.1', xRealIp: '203.0.113.7' });

      expect(resolveClientIp(request, 'socket')).toBe('10.0.0.1');
    });

    it('cai para socket.remoteAddress quando request.ip está ausente', () => {
      expect(
        resolveClientIp(buildRequest({ remoteAddress: '10.0.0.2' }), 'socket'),
      ).toBe('10.0.0.2');
    });

    it("cai para 'unknown' quando não há nenhum endereço", () => {
      expect(resolveClientIp(buildRequest({}), 'socket')).toBe('unknown');
    });
  });

  describe('modo x-real-ip', () => {
    it('usa um IPv4 válido do header', () => {
      const request = buildRequest({ ip: '10.0.0.1', xRealIp: '203.0.113.7' });

      expect(resolveClientIp(request, 'x-real-ip')).toBe('203.0.113.7');
    });

    it('usa um IPv6 válido do header', () => {
      const request = buildRequest({ ip: '10.0.0.1', xRealIp: '2001:db8::1' });

      expect(resolveClientIp(request, 'x-real-ip')).toBe('2001:db8::1');
    });

    it('aplica trim() antes de validar', () => {
      const request = buildRequest({ ip: '10.0.0.1', xRealIp: '  203.0.113.7  ' });

      expect(resolveClientIp(request, 'x-real-ip')).toBe('203.0.113.7');
    });

    it('header ausente cai no fallback do socket', () => {
      expect(resolveClientIp(buildRequest({ ip: '10.0.0.1' }), 'x-real-ip')).toBe('10.0.0.1');
    });

    it.each([
      ['vazio', ''],
      ['só espaços', '   '],
      ['texto qualquer', 'abc'],
      ['lista com vírgula', '203.0.113.7, 198.51.100.2'],
      ['IPv4 fora de faixa', '999.1.1.1'],
      ['IP com porta', '203.0.113.7:8080'],
    ])('header inválido (%s) cai no fallback do socket', (_label, value) => {
      const request = buildRequest({ ip: '10.0.0.1', xRealIp: value });

      expect(resolveClientIp(request, 'x-real-ip')).toBe('10.0.0.1');
    });

    it('header em array (header repetido) cai no fallback do socket', () => {
      const request = buildRequest({
        ip: '10.0.0.1',
        xRealIp: ['203.0.113.7', '198.51.100.2'],
      });

      expect(resolveClientIp(request, 'x-real-ip')).toBe('10.0.0.1');
    });

    it("fallback completo até 'unknown' quando header inválido e sem endereço de socket", () => {
      expect(resolveClientIp(buildRequest({ xRealIp: 'abc' }), 'x-real-ip')).toBe('unknown');
    });
  });
});
