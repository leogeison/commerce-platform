import { Inject, Injectable } from '@nestjs/common';
import { PASSWORD_HASHER, type PasswordHasher } from '../domain/password-hasher';
import { PrismaUserRepository } from '../infrastructure/prisma-user.repository';
import { ADMIN_SESSION_DURATION_MS } from '../session.constants';
import { CreateSessionUseCase } from './create-session.use-case';
import { DUMMY_PASSWORD_HASH } from './dummy-password-hash';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginSuccess {
  ok: true;
  token: string;
  /** Vem da sessão efetivamente persistida (`CreateSessionUseCase`), não recalculado aqui — quem chama usa este valor para sincronizar o cookie com o banco. */
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface LoginFailure {
  ok: false;
}

export type LoginResult = LoginSuccess | LoginFailure;

/**
 * Caso de uso de login (AUTH-005; Architecture.md, Seção 15).
 *
 * Primeiro consumidor real de `PasswordHasher` (AUTH-002) e
 * `CreateSessionUseCase` (AUTH-003) — injeta a interface `PasswordHasher`
 * via `PASSWORD_HASHER` (inversão de dependência: nunca depende de
 * `Argon2PasswordHasher` diretamente), e `PrismaUserRepository` (AUTH-001)
 * como classe concreta, já que essa tarefa deliberadamente não criou uma
 * interface própria.
 *
 * Mitigação de enumeração de e-mail por tempo de resposta: quando o
 * usuário não existe, verifica a senha recebida contra
 * `DUMMY_PASSWORD_HASH` (hash Argon2id real, mesmo custo de um hash real)
 * em vez de pular a verificação — sem isso, "usuário não existe" seria
 * mensuravelmente mais rápido que "senha incorreta", vazando quais
 * e-mails estão cadastrados.
 */
@Injectable()
export class LoginUseCase {
  constructor(
    private readonly userRepository: PrismaUserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    private readonly createSessionUseCase: CreateSessionUseCase,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const user = await this.userRepository.findByEmail(input.email);
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await this.passwordHasher.verify(
      input.password,
      passwordHash,
    );

    if (!user || !passwordMatches) {
      return { ok: false };
    }

    const session = await this.createSessionUseCase.execute({
      userId: user.id,
      expiresAt: new Date(Date.now() + ADMIN_SESSION_DURATION_MS),
    });

    return {
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }
}
