import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { BootstrapAdminModule } from '../src/modules/identity/application/bootstrap-admin.module';
import { BootstrapAdminCommand } from '../src/modules/identity/application/bootstrap-admin.command';
import { ProvisionTenantUseCase } from '../src/modules/tenancy/application/provision-tenant.use-case';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { PrismaService } from '../src/shared/database/prisma.service';

// `jest-e2e.setup.ts` garante que `ADMIN_ORIGIN` sempre existe.
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN!;
const SEED_PASSWORD = 'correct horse battery staple bootstrap';

/**
 * AUTH-013 — integração do `BootstrapAdminCommand` real (hash real +
 * `ProvisionTenantUseCase`). Exige Postgres real (mesmo requisito de
 * `database.e2e-spec.ts`).
 *
 * A interação do prompt de terminal (`bootstrap-admin.ts`, raw mode,
 * confirmação de senha) não é testada aqui por automação — é
 * intencionalmente só validação manual (Ctrl+C, eco, restauração do
 * terminal). A regra pura de confirmação (`validatePasswordConfirmation`,
 * vazio/divergente/igual) já tem cobertura própria em
 * `password-confirmation.spec.ts`.
 */
describe('BootstrapAdminCommand (integração — AUTH-013)', () => {
  let commandModule: TestingModule;
  let command: BootstrapAdminCommand;
  let provisionTenant: ProvisionTenantUseCase;
  let prisma: PrismaService;

  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    commandModule = await Test.createTestingModule({
      imports: [BootstrapAdminModule],
    }).compile();

    command = commandModule.get(BootstrapAdminCommand);
    provisionTenant = commandModule.get(ProvisionTenantUseCase);
    prisma = commandModule.get(PrismaService);

    const loginModuleFixture: TestingModule = await Test.createTestingModule({
      imports: [IdentityModule],
    }).compile();

    app = loginModuleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterEach(async () => {
    await prisma.siteUser.deleteMany({
      where: { site: { slug: { startsWith: 'auth013-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'auth013-' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'auth013-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
    await commandModule.close();
  });

  it('gera hash real e passa só o hash para ProvisionTenantUseCase, nunca a senha bruta', async () => {
    const executeSpy = jest.spyOn(provisionTenant, 'execute');

    const result = await command.execute({
      email: 'auth013-hash@test.com',
      password: SEED_PASSWORD,
      userName: 'Auth013 Hash',
      siteName: 'Auth013 Hash Site',
      siteSlug: 'auth013-hash',
      siteDomain: 'auth013-hash.test',
      siteLocale: 'pt-BR',
    });

    expect(executeSpy).toHaveBeenCalledTimes(1);
    const passedInput = executeSpy.mock.calls[0][0];

    expect(passedInput.userPasswordHash).not.toBe(SEED_PASSWORD);
    expect(passedInput.userPasswordHash).not.toContain(SEED_PASSWORD);
    expect(passedInput.userPasswordHash.startsWith('$argon2')).toBe(true);

    const persistedUser = await prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
    });
    expect(persistedUser.passwordHash).toBe(passedInput.userPasswordHash);
    expect(persistedUser.passwordHash).not.toBe(SEED_PASSWORD);
  });

  it('cria User + Site + SiteUser(OWNER) atomicamente e devolve role OWNER', async () => {
    const result = await command.execute({
      email: 'auth013-atomic@test.com',
      password: SEED_PASSWORD,
      siteName: 'Auth013 Atomic Site',
      siteSlug: 'auth013-atomic',
      siteDomain: 'auth013-atomic.test',
      siteLocale: 'pt-BR',
    });

    expect(result.role).toBe('OWNER');

    const [user, site, siteUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: result.userId } }),
      prisma.site.findUnique({ where: { id: result.siteId } }),
      prisma.siteUser.findUnique({ where: { id: result.siteUserId } }),
    ]);

    expect(user).not.toBeNull();
    expect(site).not.toBeNull();
    expect(siteUser?.role).toBe('OWNER');
    expect(siteUser?.userId).toBe(result.userId);
    expect(siteUser?.siteId).toBe(result.siteId);
  });

  it('conflito (e-mail já usado) não deixa dados parciais da segunda tentativa', async () => {
    await command.execute({
      email: 'auth013-conflict@test.com',
      password: SEED_PASSWORD,
      siteName: 'Auth013 Conflict Site 1',
      siteSlug: 'auth013-conflict-1',
      siteDomain: 'auth013-conflict-1.test',
      siteLocale: 'pt-BR',
    });

    await expect(
      command.execute({
        email: 'auth013-conflict@test.com',
        password: SEED_PASSWORD,
        siteName: 'Auth013 Conflict Site 2',
        siteSlug: 'auth013-conflict-2',
        siteDomain: 'auth013-conflict-2.test',
        siteLocale: 'pt-BR',
      }),
    ).rejects.toThrow();

    const usersCount = await prisma.user.count({
      where: { email: 'auth013-conflict@test.com' },
    });
    expect(usersCount).toBe(1);

    const secondSite = await prisma.site.findUnique({
      where: { slug: 'auth013-conflict-2' },
    });
    expect(secondSite).toBeNull();
  });

  it('rejeita senha vazia antes de chamar ProvisionTenantUseCase (nenhum dado tocado no banco)', async () => {
    const executeSpy = jest.spyOn(provisionTenant, 'execute');

    await expect(
      command.execute({
        email: 'auth013-empty-password@test.com',
        password: '',
        siteName: 'Auth013 Empty Password Site',
        siteSlug: 'auth013-empty-password',
        siteDomain: 'auth013-empty-password.test',
        siteLocale: 'pt-BR',
      }),
    ).rejects.toThrow('Senha não pode ser vazia.');

    expect(executeSpy).not.toHaveBeenCalled();

    const user = await prisma.user.findUnique({
      where: { email: 'auth013-empty-password@test.com' },
    });
    expect(user).toBeNull();
  });

  it('login real funciona com a senha criada pelo comando, independente da capitalização do e-mail usado no bootstrap', async () => {
    await command.execute({
      email: '  Auth013-Login@Test.com  ',
      password: SEED_PASSWORD,
      siteName: 'Auth013 Login Site',
      siteSlug: 'auth013-login',
      siteDomain: 'auth013-login.test',
      siteLocale: 'pt-BR',
    });

    const response = await request(app!.getHttpServer())
      .post('/admin/auth/login')
      .set('Origin', ADMIN_ORIGIN)
      .send({ email: 'AUTH013-LOGIN@TEST.COM', password: SEED_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('auth013-login@test.com');
  });
});
