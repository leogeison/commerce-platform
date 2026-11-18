import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { EnvVars } from '../config/env.schema';
import { resolveClientIp } from './client-ip';
import {
  RATE_LIMIT_METADATA_KEY,
  RateLimitOptions,
} from './rate-limit.decorator';
import { RateLimitStore } from './rate-limit.store';

/**
 * Guard reutilizável de rate limit (INF-007). Lê a configuração
 * (`limit`/`windowMs`) anexada via `@RateLimit(...)` no handler ou no
 * controller (handler tem prioridade); sem essa metadata, deixa a
 * requisição passar — nenhum limite configurado, nada a aplicar.
 *
 * Chave do limite: `Classe:handler:IP`. O IP vem de `resolveClientIp`,
 * conforme `CLIENT_IP_SOURCE` (PROD-002: `socket` por padrão; `x-real-ip`
 * só atrás de proxy confirmado). O IP isola clientes entre si (o
 * requisito da tarefa); o prefixo de classe/handler evita que duas rotas
 * distintas, cada uma com seu próprio `@RateLimit`, compartilhem sem querer
 * o mesmo contador dentro do `RateLimitStore` (que é um único `Map`
 * compartilhado pela aplicação inteira via DI).
 *
 * Exceder o limite → `429 Too Many Requests`.
 *
 * Não é registrado como `APP_GUARD`: só se aplica onde for anexado
 * explicitamente via `@UseGuards(RateLimitGuard)` numa rota que também
 * tenha `@RateLimit(...)`. Aplicado em `POST /admin/auth/login` (AUTH-005)
 * e em `GET /r/:siteSlug/:offerId` (TRK-007).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
    private readonly configService: ConfigService<EnvVars, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<
      RateLimitOptions | undefined
    >(RATE_LIMIT_METADATA_KEY, [context.getHandler(), context.getClass()]);

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const clientIpSource = this.configService.get('CLIENT_IP_SOURCE', {
      infer: true,
    });
    const key = `${context.getClass().name}:${context.getHandler().name}:${resolveClientIp(request, clientIpSource)}`;

    const result = this.store.consume(key, options.limit, options.windowMs);

    if (!result.allowed) {
      throw new HttpException(
        'Muitas requisições. Tente novamente mais tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
