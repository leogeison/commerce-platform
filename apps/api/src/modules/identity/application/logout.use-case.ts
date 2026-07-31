import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';

export interface LogoutInput {
  sessionId: string;
}

/**
 * Caso de uso de logout (AUTH-007; Architecture.md, Seção 15, item 6:
 * "Logout revoga a sessão no banco e remove o cookie" — a remoção do
 * cookie fica a cargo de quem chama, `AuthController`, via
 * `SessionCookieHelper`; este caso de uso cuida só da revogação real no
 * banco).
 *
 * Sem repository dedicado (`infrastructure/`), mesmo padrão de
 * `CreateSessionUseCase` (AUTH-003): `PrismaService` direto num caso de uso
 * de `application/`, enquanto não houver necessidade comprovada de uma
 * camada própria.
 *
 * `sessionId` chega pronto de quem chama (o controller, a partir de
 * `request.auth.sessionId` já resolvido pelo `SessionAuthGuard` — AUTH-006):
 * este caso de uso nunca decide qual sessão revogar, só executa a
 * revogação da que já foi identificada como a sessão autenticada da
 * requisição atual. Fora de escopo (backlog): revogar todas as sessões do
 * usuário — sempre uma única sessão, a da própria requisição.
 */
@Injectable()
export class LogoutUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: LogoutInput): Promise<void> {
    await this.prisma.session.update({
      where: { id: input.sessionId },
      data: { revokedAt: new Date() },
    });
  }
}
