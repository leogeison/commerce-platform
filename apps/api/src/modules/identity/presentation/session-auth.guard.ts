import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { EnvVars } from '../../../shared/config/env.schema';
import { hashSessionToken } from '../domain/session-token';
import { ADMIN_SESSION_COOKIE_NAME } from '../session.constants';
import type { AuthContext } from './auth-context';

/**
 * Mesma mensagem para todo desfecho inválido (cookie ausente, token
 * desconhecido, sessão expirada, sessão revogada) — nunca revela qual dos
 * casos ocorreu, mesmo padrão de mensagem genérica já usado em
 * `LoginUseCase`/`AuthController` (AUTH-005).
 */
const INVALID_SESSION_MESSAGE = 'Sessão inválida ou expirada.';

/**
 * Guard de autenticação por sessão opaca (AUTH-006; Architecture.md,
 * Seção 15).
 *
 * Lê o cookie `admin_session` (cru), recalcula o hash com `SESSION_SECRET`
 * e busca a `Session` por `tokenHash` numa única consulta com
 * `include: { user: true }` — `Session.user` é relação obrigatória
 * (`userId` não-opcional, `onDelete: Cascade` a partir de `User`), então
 * uma `Session` encontrada sempre tem `user` presente; não há checagem
 * redundante de "sessão sem usuário".
 *
 * Escopo estritamente desta tarefa: resolve `User` + `sessionId` e valida
 * expiração/revogação. Resolução de `SiteUser`/Role fica para AUTH-009.
 *
 * Sem repository/use-case dedicado de propósito — a tarefa lista só
 * `identity/presentation/` como área, e o mesmo padrão de acesso direto ao
 * `PrismaService` (sem camada extra) já é usado por `CreateSessionUseCase`
 * (AUTH-003).
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvVars, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawToken = request.cookies?.[ADMIN_SESSION_COOKIE_NAME] as
      | string
      | undefined;

    if (!rawToken) {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    const secret = this.configService.get('SESSION_SECRET', { infer: true });
    const tokenHash = hashSessionToken(secret, rawToken);

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    const auth: AuthContext = {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      sessionId: session.id,
    };
    request.auth = auth;

    return true;
  }
}
