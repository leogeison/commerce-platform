import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ClientIpSource } from './client-ip';
import { RateLimit } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitStore } from './rate-limit.store';

class UnlimitedController {
  free(): void {
    /* sem @RateLimit */
  }
}

class LimitedController {
  @RateLimit({ limit: 2, windowMs: 60_000 })
  limited(): void {
    /* protegida */
  }
}

function buildContext(
  klass: new (...args: never[]) => unknown,
  handlerName: string,
  ip: string,
  headers: Record<string, string> = {},
): ExecutionContext {
  const handler = (klass.prototype as Record<string, () => void>)[
    handlerName
  ];

  return {
    getHandler: () => handler,
    getClass: () => klass,
    switchToHttp: () => ({
      getRequest: () => ({ ip, socket: {}, headers }),
    }),
  } as unknown as ExecutionContext;
}

function buildConfig(source: ClientIpSource = 'socket'): ConfigService {
  return { get: () => source } as unknown as ConfigService;
}

function buildGuard(source: ClientIpSource = 'socket'): RateLimitGuard {
  return new RateLimitGuard(new Reflector(), new RateLimitStore(), buildConfig(source) as never);
}

describe('RateLimitGuard', () => {
  it('deixa passar quando a rota não tem @RateLimit', () => {
    const guard = buildGuard();
    const context = buildContext(UnlimitedController, 'free', '1.1.1.1');

    expect(guard.canActivate(context)).toBe(true);
  });

  it('permite requisições dentro do limite configurado via @RateLimit', () => {
    const guard = buildGuard();
    const context = buildContext(LimitedController, 'limited', '2.2.2.2');

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('lança 429 ao exceder o limite configurado', () => {
    const guard = buildGuard();
    const context = buildContext(LimitedController, 'limited', '3.3.3.3');

    guard.canActivate(context);
    guard.canActivate(context);

    expect(() => guard.canActivate(context)).toThrow(HttpException);
    try {
      guard.canActivate(context);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('isola o limite por IP mesmo na mesma rota', () => {
    const guard = buildGuard();
    const contextIpA = buildContext(LimitedController, 'limited', '4.4.4.4');
    const contextIpB = buildContext(LimitedController, 'limited', '5.5.5.5');

    guard.canActivate(contextIpA);
    guard.canActivate(contextIpA);
    expect(() => guard.canActivate(contextIpA)).toThrow(HttpException);

    // IP diferente, mesma rota: contador independente, ainda dentro do limite.
    expect(guard.canActivate(contextIpB)).toBe(true);
  });

  it('CLIENT_IP_SOURCE=x-real-ip: clientes com X-Real-IP diferentes atrás do mesmo proxy têm buckets separados', () => {
    const guard = buildGuard('x-real-ip');
    const proxyIp = '10.0.0.1';
    const clientA = buildContext(LimitedController, 'limited', proxyIp, { 'x-real-ip': '203.0.113.1' });
    const clientB = buildContext(LimitedController, 'limited', proxyIp, { 'x-real-ip': '203.0.113.2' });

    guard.canActivate(clientA);
    guard.canActivate(clientA);
    expect(() => guard.canActivate(clientA)).toThrow(HttpException);

    expect(guard.canActivate(clientB)).toBe(true);
  });

  it('CLIENT_IP_SOURCE=socket: X-Real-IP diferentes no mesmo socket compartilham o bucket (header ignorado)', () => {
    const guard = buildGuard('socket');
    const socketIp = '10.0.0.2';
    const forgedA = buildContext(LimitedController, 'limited', socketIp, { 'x-real-ip': '203.0.113.1' });
    const forgedB = buildContext(LimitedController, 'limited', socketIp, { 'x-real-ip': '203.0.113.2' });

    guard.canActivate(forgedA);
    guard.canActivate(forgedB);

    expect(() => guard.canActivate(forgedA)).toThrow(HttpException);
  });
});
