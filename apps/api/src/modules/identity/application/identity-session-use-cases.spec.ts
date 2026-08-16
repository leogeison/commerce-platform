import type { Session, User } from '../../../generated/prisma/client';
import type { PrismaUserRepository } from '../infrastructure/prisma-user.repository';
import type { PasswordHasher } from '../domain/password-hasher';
import type { CreateSessionUseCase } from './create-session.use-case';
import type { PrismaService } from '../../../shared/database/prisma.service';
import { LoginUseCase } from './login.use-case';
import { LogoutUseCase } from './logout.use-case';
import { DUMMY_PASSWORD_HASH } from './dummy-password-hash';
import { ADMIN_SESSION_DURATION_MS } from '../session.constants';

/**
 * QA-001 — `LoginUseCase` (AUTH-005) tem lógica própria além de delegação
 * (mitigação de timing attack, condição de falha combinada, composição do
 * retorno de sucesso a partir da sessão persistida) e por isso ganha teste
 * mais completo — diferente dos passthroughs puros deste bloco.
 * `LogoutUseCase` é passthrough simples (`prisma.session.update`) e fica no
 * mesmo arquivo por afinidade de módulo (ciclo de vida de sessão).
 */
const USER_ID = 'user-1';
const REAL_HASH = 'hash-real-do-usuario';

function buildFakeUserRepository(user: User | null) {
  return { findByEmail: jest.fn().mockResolvedValue(user) } as unknown as PrismaUserRepository;
}

function buildFakePasswordHasher(verifyResult: boolean) {
  return {
    verify: jest.fn().mockResolvedValue(verifyResult),
    hash: jest.fn(),
  } as unknown as PasswordHasher;
}

function buildFakeCreateSessionUseCase(session: { token: string; sessionId: string; expiresAt: Date }) {
  return { execute: jest.fn().mockResolvedValue(session) } as unknown as CreateSessionUseCase;
}

describe('LoginUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-16T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('usuário não existe: verifica contra DUMMY_PASSWORD_HASH (nunca pula a verificação) e retorna falha genérica', async () => {
    const userRepository = buildFakeUserRepository(null);
    const passwordHasher = buildFakePasswordHasher(false);
    const createSessionUseCase = buildFakeCreateSessionUseCase({
      token: 't',
      sessionId: 's',
      expiresAt: new Date(),
    });
    const useCase = new LoginUseCase(userRepository, passwordHasher, createSessionUseCase);

    const result = await useCase.execute({ email: 'inexistente@x.com', password: 'qualquer' });

    expect(passwordHasher.verify).toHaveBeenCalledWith('qualquer', DUMMY_PASSWORD_HASH);
    expect(result).toEqual({ ok: false });
    expect(createSessionUseCase.execute).not.toHaveBeenCalled();
  });

  it('usuário existe mas senha incorreta: verifica contra o hash real e retorna a mesma falha genérica', async () => {
    const fakeUser = { id: USER_ID, email: 'a@x.com', name: 'A', passwordHash: REAL_HASH } as unknown as User;
    const userRepository = buildFakeUserRepository(fakeUser);
    const passwordHasher = buildFakePasswordHasher(false);
    const createSessionUseCase = buildFakeCreateSessionUseCase({
      token: 't',
      sessionId: 's',
      expiresAt: new Date(),
    });
    const useCase = new LoginUseCase(userRepository, passwordHasher, createSessionUseCase);

    const result = await useCase.execute({ email: 'a@x.com', password: 'senha-errada' });

    expect(passwordHasher.verify).toHaveBeenCalledWith('senha-errada', REAL_HASH);
    expect(result).toEqual({ ok: false });
    expect(createSessionUseCase.execute).not.toHaveBeenCalled();
  });

  it('sucesso: cria sessão com userId e expiresAt (agora + 8h) e devolve token/expiresAt/user a partir da sessão persistida', async () => {
    const fakeUser = { id: USER_ID, email: 'a@x.com', name: 'A', passwordHash: REAL_HASH } as unknown as User;
    const userRepository = buildFakeUserRepository(fakeUser);
    const passwordHasher = buildFakePasswordHasher(true);
    const persistedSession = {
      token: 'token-bruto',
      sessionId: 'session-1',
      expiresAt: new Date('2026-08-16T20:00:05.000Z'), // não precisa bater com o cálculo interno
    };
    const createSessionUseCase = buildFakeCreateSessionUseCase(persistedSession);
    const useCase = new LoginUseCase(userRepository, passwordHasher, createSessionUseCase);

    const result = await useCase.execute({ email: 'a@x.com', password: 'senha-certa' });

    expect(createSessionUseCase.execute).toHaveBeenCalledWith({
      userId: USER_ID,
      expiresAt: new Date(Date.now() + ADMIN_SESSION_DURATION_MS),
    });
    expect(result).toEqual({
      ok: true,
      token: persistedSession.token,
      expiresAt: persistedSession.expiresAt,
      user: { id: USER_ID, email: 'a@x.com', name: 'A' },
    });
  });
});

describe('LogoutUseCase', () => {
  it('revoga a sessão certa via prisma.session.update', async () => {
    const update = jest.fn().mockResolvedValue({} as Session);
    const prisma = { session: { update } } as unknown as PrismaService;
    const useCase = new LogoutUseCase(prisma);

    await useCase.execute({ sessionId: 'session-1' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
