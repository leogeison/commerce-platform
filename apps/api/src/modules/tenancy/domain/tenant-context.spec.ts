import {
  resolveAdminTenantContext,
  resolvePublicTenantContext,
  ResolvedSite,
  ResolvedSiteMembership,
} from './tenant-context';

const siteA: ResolvedSite = { id: 'site-a', slug: 'fastcompre' };
const siteB: ResolvedSite = { id: 'site-b', slug: 'quickdealday' };

describe('resolvePublicTenantContext', () => {
  it('retorna o TenantContext quando o Site existe', () => {
    const result = resolvePublicTenantContext(siteA);

    expect(result).toEqual({
      ok: true,
      context: { siteId: 'site-a', siteSlug: 'fastcompre' },
    });
  });

  it('retorna falha explícita (SITE_NOT_FOUND) quando o Site é null', () => {
    const result = resolvePublicTenantContext(null);

    expect(result).toEqual({
      ok: false,
      failure: { reason: 'SITE_NOT_FOUND' },
    });
  });

  it('o TenantContext retornado é imutável em runtime', () => {
    const result = resolvePublicTenantContext(siteA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.context)).toBe(true);
      expect(() => {
        (result.context as { siteId: string }).siteId = 'outro';
      }).toThrow();
    }
  });
});

describe('resolveAdminTenantContext', () => {
  it('retorna o TenantContext quando o Site existe e há SiteUser correspondente', () => {
    const membership: ResolvedSiteMembership = {
      siteId: 'site-a',
      userId: 'user-1',
    };

    const result = resolveAdminTenantContext(siteA, membership);

    expect(result).toEqual({
      ok: true,
      context: { siteId: 'site-a', siteSlug: 'fastcompre' },
    });
  });

  it('retorna falha (SITE_NOT_FOUND) quando o Site é null, mesmo com membership presente', () => {
    const membership: ResolvedSiteMembership = {
      siteId: 'site-a',
      userId: 'user-1',
    };

    const result = resolveAdminTenantContext(null, membership);

    expect(result).toEqual({
      ok: false,
      failure: { reason: 'SITE_NOT_FOUND' },
    });
  });

  it('retorna falha (MEMBERSHIP_NOT_FOUND) quando não há SiteUser', () => {
    const result = resolveAdminTenantContext(siteA, null);

    expect(result).toEqual({
      ok: false,
      failure: { reason: 'MEMBERSHIP_NOT_FOUND' },
    });
  });

  it('ignora um siteId "forjado": membership de outro Site não concede acesso ao Site requisitado', () => {
    // Simula um usuário que só tem SiteUser no Site B (ex.: é OWNER lá),
    // mas o Site sendo requisitado (ex.: "projeto atual" escolhido na UI,
    // que um atacante poderia tentar forçar num body de requisição) é o
    // Site A. Nada nesta função aceita um `siteId` cru vindo de fora — só o
    // `site` resolvido e o `membership` resolvido, então a única forma de
    // "forjar" o Site seria fornecer um `membership` que não corresponde: e
    // isso é exatamente o que esta função rejeita.
    const membershipNoSiteB: ResolvedSiteMembership = {
      siteId: 'site-b',
      userId: 'user-1',
    };

    const result = resolveAdminTenantContext(siteA, membershipNoSiteB);

    expect(result).toEqual({
      ok: false,
      failure: { reason: 'MEMBERSHIP_NOT_FOUND' },
    });
  });

  it('ser OWNER/ter SiteUser em um Site não concede acesso a outro Site', () => {
    const membershipOnSiteA: ResolvedSiteMembership = {
      siteId: 'site-a',
      userId: 'user-1',
    };

    // O mesmo membership não serve para resolver o contexto do Site B.
    const result = resolveAdminTenantContext(siteB, membershipOnSiteA);

    expect(result).toEqual({
      ok: false,
      failure: { reason: 'MEMBERSHIP_NOT_FOUND' },
    });
  });

  it('o TenantContext retornado é imutável em runtime', () => {
    const membership: ResolvedSiteMembership = {
      siteId: 'site-a',
      userId: 'user-1',
    };

    const result = resolveAdminTenantContext(siteA, membership);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.context)).toBe(true);
    }
  });
});

describe('ausência de estado global — chamadas para Sites diferentes nunca compartilham contexto', () => {
  it('chamadas intercaladas (simulando concorrência) para Sites distintos permanecem isoladas', async () => {
    const membershipA: ResolvedSiteMembership = {
      siteId: 'site-a',
      userId: 'user-1',
    };
    const membershipB: ResolvedSiteMembership = {
      siteId: 'site-b',
      userId: 'user-2',
    };

    // Intercala chamadas para Site A e Site B "concorrentemente" via
    // Promise.all — como as funções são puras e síncronas (sem nenhuma
    // variável de módulo/closure compartilhada mutável), não há como uma
    // chamada influenciar o resultado da outra. Se houvesse estado global
    // (ex.: um "tenant atual" salvo em alguma variável entre chamadas),
    // executar as duas em paralelo poderia vazar o contexto de uma
    // requisição para a outra.
    const [resultA, resultB] = await Promise.all([
      Promise.resolve(resolveAdminTenantContext(siteA, membershipA)),
      Promise.resolve(resolveAdminTenantContext(siteB, membershipB)),
    ]);

    expect(resultA).toEqual({
      ok: true,
      context: { siteId: 'site-a', siteSlug: 'fastcompre' },
    });
    expect(resultB).toEqual({
      ok: true,
      context: { siteId: 'site-b', siteSlug: 'quickdealday' },
    });
  });

  it('100 chamadas alternadas entre dois Sites nunca retornam o contexto do outro', () => {
    const membershipA: ResolvedSiteMembership = {
      siteId: 'site-a',
      userId: 'user-1',
    };
    const membershipB: ResolvedSiteMembership = {
      siteId: 'site-b',
      userId: 'user-2',
    };

    for (let i = 0; i < 100; i += 1) {
      const resultA = resolveAdminTenantContext(siteA, membershipA);
      const resultB = resolveAdminTenantContext(siteB, membershipB);

      expect(resultA.ok && resultA.context.siteId).toBe('site-a');
      expect(resultB.ok && resultB.context.siteId).toBe('site-b');
    }
  });
});
