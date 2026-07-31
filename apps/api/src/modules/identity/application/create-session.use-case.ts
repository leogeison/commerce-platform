import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { EnvVars } from '../../../shared/config/env.schema';
import { generateSessionToken, hashSessionToken } from '../domain/session-token';

/**
 * `expiresAt` chega sempre pronto: esta tarefa (AUTH-003) não decide
 * política de duração de sessão — nenhum documento oficial (Architecture.md,
 * Implementation-Backlog.md, `.env.example`) define isso, e o próprio
 * `SessionCookieHelper` (INF-004) já registrava essa decisão como pendente
 * pra cá. Quem chama este caso de uso (o futuro fluxo de login, AUTH-005)
 * decide a duração; `CreateSessionUseCase` só gera e persiste.
 */
export interface CreateSessionInput {
  userId: string;
  expiresAt: Date;
}

export interface CreateSessionResult {
  /** Token BRUTO — só existe neste retorno em memória, nunca é persistido nem logado. Vira cookie no futuro fluxo de login/guard (AUTH-005/AUTH-006). */
  token: string;
  sessionId: string;
  expiresAt: Date;
}

/**
 * Caso de uso de criação de sessão opaca (AUTH-003; Architecture.md,
 * Seção 15).
 *
 * Sem repository dedicado (`infrastructure/`) de propósito: a tarefa não
 * lista essa pasta em "Arquivos/áreas", e o mesmo padrão já existe em
 * `ProvisionTenantUseCase` (DB-013) — usar `PrismaService` direto num caso
 * de uso de `application/`, sem camada de repository própria, enquanto não
 * houver necessidade comprovada de uma.
 */
@Injectable()
export class CreateSessionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvVars, true>,
  ) {}

  async execute(input: CreateSessionInput): Promise<CreateSessionResult> {
    const token = generateSessionToken();
    const secret = this.configService.get('SESSION_SECRET', { infer: true });
    const tokenHash = hashSessionToken(secret, token);

    const session = await this.prisma.session.create({
      data: {
        userId: input.userId,
        tokenHash,
        expiresAt: input.expiresAt,
      },
    });

    return {
      token,
      sessionId: session.id,
      expiresAt: session.expiresAt,
    };
  }
}
