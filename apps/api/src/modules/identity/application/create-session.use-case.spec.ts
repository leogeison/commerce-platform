import type { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../../../shared/config/env.schema';
import type { PrismaService } from '../../../shared/database/prisma.service';
import { hashSessionToken } from '../domain/session-token';
import { CreateSessionUseCase } from './create-session.use-case';

const SESSION_SECRET = 'e2e-test-session-secret-0000000';
const PRISMA_SESSION_ID = 'session-id-vindo-do-prisma';

/**
 * `create` devolve um `expiresAt` **diferente** do que foi enviado em
 * `data` (1 segundo depois) — de propósito, só pra provar que o retorno do
 * caso de uso usa o valor efetivamente devolvido pelo Prisma, e não apenas
 * ecoa o `input.expiresAt` recebido.
 */
function buildFakePrisma() {
  const create = jest
    .fn()
    .mockImplementation(
      ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) =>
        Promise.resolve({
          id: PRISMA_SESSION_ID,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: new Date(data.expiresAt.getTime() + 1000),
          revokedAt: null,
          createdAt: new Date(),
        }),
    );

  return {
    create,
    prisma: { session: { create } } as unknown as PrismaService,
  };
}

function buildFakeConfigService(): ConfigService<EnvVars, true> {
  return {
    get: jest.fn().mockReturnValue(SESSION_SECRET),
  } as unknown as ConfigService<EnvVars, true>;
}

function lastCreateData(create: jest.Mock): {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
} {
  return (create.mock.calls[0][0] as { data: Record<string, unknown> })
    .data as { userId: string; tokenHash: string; expiresAt: Date };
}

describe('CreateSessionUseCase', () => {
  it('persiste userId e expiresAt corretamente', async () => {
    const { create, prisma } = buildFakePrisma();
    const useCase = new CreateSessionUseCase(prisma, buildFakeConfigService());
    const expiresAt = new Date('2026-08-30T00:00:00.000Z');

    await useCase.execute({ userId: 'user-1', expiresAt });

    const data = lastCreateData(create);
    expect(data.userId).toBe('user-1');
    expect(data.expiresAt).toBe(expiresAt);
  });

  it('envia ao Prisma um objeto com tokenHash, mas nunca uma propriedade token', async () => {
    const { create, prisma } = buildFakePrisma();
    const useCase = new CreateSessionUseCase(prisma, buildFakeConfigService());

    await useCase.execute({ userId: 'user-1', expiresAt: new Date() });

    const data = lastCreateData(create);
    expect(data).toHaveProperty('tokenHash');
    expect(data).not.toHaveProperty('token');
  });

  it('o tokenHash persistido é diferente do token bruto retornado', async () => {
    const { create, prisma } = buildFakePrisma();
    const useCase = new CreateSessionUseCase(prisma, buildFakeConfigService());

    const result = await useCase.execute({
      userId: 'user-1',
      expiresAt: new Date(),
    });
    const data = lastCreateData(create);

    expect(data.tokenHash).not.toBe(result.token);
  });

  it('o tokenHash persistido coincide com hashSessionToken(secret, token)', async () => {
    const { create, prisma } = buildFakePrisma();
    const useCase = new CreateSessionUseCase(prisma, buildFakeConfigService());

    const result = await useCase.execute({
      userId: 'user-1',
      expiresAt: new Date(),
    });
    const data = lastCreateData(create);

    expect(data.tokenHash).toBe(hashSessionToken(SESSION_SECRET, result.token));
  });

  it('retorna { token, sessionId, expiresAt } usando os valores da sessão efetivamente devolvida pelo Prisma', async () => {
    const { prisma } = buildFakePrisma();
    const useCase = new CreateSessionUseCase(prisma, buildFakeConfigService());
    const expiresAt = new Date('2026-09-15T12:00:00.000Z');

    const result = await useCase.execute({ userId: 'user-1', expiresAt });

    expect(result).toEqual({
      token: expect.any(String),
      sessionId: PRISMA_SESSION_ID,
      // 1s depois do input — só existe se o retorno veio do objeto
      // devolvido pelo `prisma.session.create`, não do `input.expiresAt`.
      expiresAt: new Date(expiresAt.getTime() + 1000),
    });
  });
});
