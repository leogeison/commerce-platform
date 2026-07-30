import { RateLimitStore } from './rate-limit.store';

describe('RateLimitStore', () => {
  it('permite requisições dentro do limite', () => {
    const store = new RateLimitStore();
    const now = 1_000;

    const first = store.consume('key', 3, 10_000, now);
    const second = store.consume('key', 3, 10_000, now + 1);
    const third = store.consume('key', 3, 10_000, now + 2);

    expect(first).toMatchObject({ allowed: true, remaining: 2 });
    expect(second).toMatchObject({ allowed: true, remaining: 1 });
    expect(third).toMatchObject({ allowed: true, remaining: 0 });
  });

  it('bloqueia a partir da requisição que excede o limite', () => {
    const store = new RateLimitStore();
    const now = 1_000;

    store.consume('key', 2, 10_000, now);
    store.consume('key', 2, 10_000, now + 1);
    const third = store.consume('key', 2, 10_000, now + 2);
    const fourth = store.consume('key', 2, 10_000, now + 3);

    expect(third).toMatchObject({ allowed: false, remaining: 0 });
    expect(fourth).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('reseta o contador depois do fim da janela', () => {
    const store = new RateLimitStore();
    const windowMs = 10_000;
    const now = 1_000;

    store.consume('key', 1, windowMs, now);
    const blocked = store.consume('key', 1, windowMs, now + 1);
    expect(blocked.allowed).toBe(false);

    const afterWindow = store.consume('key', 1, windowMs, now + windowMs);
    expect(afterWindow).toMatchObject({ allowed: true, remaining: 0 });
  });

  it('isola o contador entre chaves (IPs) diferentes', () => {
    const store = new RateLimitStore();
    const now = 1_000;

    store.consume('ip-a', 1, 10_000, now);
    const ipABlocked = store.consume('ip-a', 1, 10_000, now + 1);
    const ipBAllowed = store.consume('ip-b', 1, 10_000, now + 1);

    expect(ipABlocked.allowed).toBe(false);
    expect(ipBAllowed.allowed).toBe(true);
  });

  it('respeita configurações diferentes de janela e limite por chamada', () => {
    const store = new RateLimitStore();
    const now = 1_000;

    // chave "strict": limite 1, janela longa.
    const strictFirst = store.consume('strict', 1, 60_000, now);
    const strictSecond = store.consume('strict', 1, 60_000, now + 1);

    // chave "loose": limite 10, janela curta — configuração independente,
    // mesmo store, mesmo instante.
    const looseCalls = Array.from({ length: 10 }, (_, index) =>
      store.consume('loose', 10, 1_000, now + index),
    );

    expect(strictFirst.allowed).toBe(true);
    expect(strictSecond.allowed).toBe(false);
    expect(looseCalls.every((result) => result.allowed)).toBe(true);

    // depois de esgotar "loose", a próxima é bloqueada.
    const looseBlocked = store.consume('loose', 10, 1_000, now + 10);
    expect(looseBlocked.allowed).toBe(false);
  });

  it('remove buckets expirados do Map durante o consume (limpeza lazy)', () => {
    const store = new RateLimitStore();
    const now = 1_000;
    const internalBuckets = (
      store as unknown as { buckets: Map<string, unknown> }
    ).buckets;

    store.consume('key-a', 1, 1_000, now);
    store.consume('key-b', 1, 1_000, now);
    expect(internalBuckets.size).toBe(2);

    // avança além da janela de "key-a" e "key-b" e consome uma terceira chave.
    store.consume('key-c', 1, 1_000, now + 5_000);

    expect(internalBuckets.size).toBe(1);
    expect(internalBuckets.has('key-c')).toBe(true);
    expect(internalBuckets.has('key-a')).toBe(false);
    expect(internalBuckets.has('key-b')).toBe(false);
  });
});
