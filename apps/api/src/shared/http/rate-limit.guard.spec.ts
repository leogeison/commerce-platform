import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
): ExecutionContext {
  const handler = (klass.prototype as Record<string, () => void>)[
    handlerName
  ];

  return {
    getHandler: () => handler,
    getClass: () => klass,
    switchToHttp: () => ({
      getRequest: () => ({ ip, socket: {} }),
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  it('deixa passar quando a rota não tem @RateLimit', () => {
    const guard = new RateLimitGuard(new Reflector(), new RateLimitStore());
    const context = buildContext(UnlimitedController, 'free', '1.1.1.1');

    expect(guard.canActivate(context)).toBe(true);
  });

  it('permite requisições dentro do limite configurado via @RateLimit', () => {
    const guard = new RateLimitGuard(new Reflector(), new RateLimitStore());
    const context = buildContext(LimitedController, 'limited', '2.2.2.2');

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('lança 429 ao exceder o limite configurado', () => {
    const guard = new RateLimitGuard(new Reflector(), new RateLimitStore());
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
    const guard = new RateLimitGuard(new Reflector(), new RateLimitStore());
    const contextIpA = buildContext(LimitedController, 'limited', '4.4.4.4');
    const contextIpB = buildContext(LimitedController, 'limited', '5.5.5.5');

    guard.canActivate(contextIpA);
    guard.canActivate(contextIpA);
    expect(() => guard.canActivate(contextIpA)).toThrow(HttpException);

    // IP diferente, mesma rota: contador independente, ainda dentro do limite.
    expect(guard.canActivate(contextIpB)).toBe(true);
  });
});
