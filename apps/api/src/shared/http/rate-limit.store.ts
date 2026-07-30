import { Injectable } from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitConsumeResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Armazenamento em memória do estado de rate limit (INF-007), por janela
 * fixa: cada chave tem um contador que reinicia quando `now >= resetAt`.
 *
 * ATENÇÃO — em memória e por processo: cada instância da API mantém seu
 * próprio estado, isolado das demais. Isso é suficiente para o MVP
 * (Architecture.md reserva Redis para necessidades futuras de fila/cache,
 * "uso... reservado para necessidades futuras — não presente no MVP"), mas
 * deixa de garantir o limite corretamente com múltiplas instâncias/réplicas
 * atrás de um load balancer: cada réplica aplicaria o limite de forma
 * independente, sem saber do estado das outras (um cliente poderia atingir
 * `limit × réplicas` requisições reais antes de ser bloqueado em todas).
 * Migrar para um store compartilhado (ex.: Redis) quando isso passar a
 * importar.
 *
 * `now` é recebido como parâmetro explícito em vez de lido internamente via
 * `Date.now()` — o algoritmo fica determinístico e testável sem depender de
 * fake timers ou esperas reais nos testes; em produção, o parâmetro é
 * simplesmente omitido e assume o relógio real.
 *
 * Limpeza de buckets expirados: oportunista (lazy), dentro do próprio
 * `consume()` — sem `setInterval`/timer em background. Cada chamada varre o
 * `Map` e remove qualquer bucket cuja janela já tenha expirado antes de
 * seguir com a chave atual. Isso evita crescimento ilimitado de memória por
 * chaves (IPs) que pararam de fazer requisições, sem exigir nenhuma
 * infraestrutura de agendamento — suficiente para o MVP.
 */
@Injectable()
export class RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  consume(
    key: string,
    limit: number,
    windowMs: number,
    now: number = Date.now(),
  ): RateLimitConsumeResult {
    this.evictExpired(now);

    const existing = this.buckets.get(key);

    if (!existing) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
    }

    existing.count += 1;
    const allowed = existing.count <= limit;

    return {
      allowed,
      remaining: Math.max(0, limit - existing.count),
      resetAt: existing.resetAt,
    };
  }

  private evictExpired(now: number): void {
    for (const [bucketKey, bucket] of this.buckets) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(bucketKey);
      }
    }
  }
}
