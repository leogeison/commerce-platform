import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvVars } from '../config/env.schema';

const MUTABLE_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

function extractOriginFromReferer(referer: string | undefined): string | undefined {
  if (!referer) {
    return undefined;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * Proteção CSRF adicional além do `SameSite=Lax` (INF-006; Architecture.md,
 * Seção 15). Rejeita qualquer `POST`/`PATCH`/`DELETE` cuja origem não seja
 * exatamente a do admin — mesma variável `ADMIN_ORIGIN` do CORS (INF-005).
 *
 * Checa `Origin` primeiro; se ausente, cai para `Referer` (extraindo só a
 * origem dele) — alguns clientes não enviam `Origin` em certas requisições,
 * mas navegadores sempre mandam pelo menos um dos dois numa navegação real.
 * Sem nenhum dos dois, ou com origem diferente da esperada: `403`.
 *
 * `GET`/`HEAD`/`OPTIONS` (e qualquer outro método fora do conjunto mutável)
 * passam direto — esta guarda só existe para escrita.
 *
 * Fora de escopo: token CSRF explícito — só entra se isto se mostrar
 * insuficiente (nota do próprio backlog).
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<EnvVars, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!MUTABLE_METHODS.has(request.method)) {
      return true;
    }

    const adminOrigin = this.configService.get('ADMIN_ORIGIN', {
      infer: true,
    });
    const candidate =
      request.headers.origin ?? extractOriginFromReferer(request.headers.referer);

    if (candidate !== adminOrigin) {
      throw new ForbiddenException(
        'Origem não autorizada para esta operação.',
      );
    }

    return true;
  }
}
