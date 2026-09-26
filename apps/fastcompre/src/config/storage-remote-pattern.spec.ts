import { describe, expect, it } from '@jest/globals';
import { DEV_FALLBACK_STORAGE_PUBLIC_URL_BASE, resolveStorageImagesConfig } from './storage-remote-pattern';

/**
 * Revisão de segurança (pós-implementação inicial da UXW-013): `nodeEnv` é
 * sempre passado explicitamente como segundo argumento (nunca via mutação
 * global de `process.env.NODE_ENV`), então cada teste é isolado e não
 * precisa de `beforeEach`/`afterEach` para restaurar ambiente.
 *
 * `'test'` é tratado explicitamente como "fora de produção" em vários
 * testes abaixo — é o valor real de `NODE_ENV` sob o qual `next/jest`
 * roda esta própria suíte — precisamente para provar que ele nunca
 * enfraquece a regra de produção (só `nodeEnv === 'production'` aciona o
 * comportamento fail-fast).
 */
describe('resolveStorageImagesConfig', () => {
  describe('fora de produção (development/test/indefinido) — comportamento já aprovado, nunca fatal', () => {
    it('development + env ausente (undefined): cai para o fallback localhost, com warning, IP local permitido', () => {
      const result = resolveStorageImagesConfig(undefined, 'development');

      expect(result).toEqual({
        remotePatterns: [{ protocol: 'http', hostname: 'localhost', port: '9000', pathname: '/local-dev-bucket/**' }],
        dangerouslyAllowLocalIP: true,
        warning: expect.stringMatching(/não configurada/),
      });
    });

    it('development + env vazia (""): mesmo comportamento do caso ausente', () => {
      const result = resolveStorageImagesConfig('', 'development');
      expect(result.dangerouslyAllowLocalIP).toBe(true);
      expect(result.warning).toMatch(/não configurada/);
    });

    it('development + env inválida (não é URL http/https): cai para o fallback localhost, com warning, IP local permitido', () => {
      const result = resolveStorageImagesConfig('isto não é uma url', 'development');

      expect(result.remotePatterns).toEqual([
        { protocol: 'http', hostname: 'localhost', port: '9000', pathname: '/local-dev-bucket/**' },
      ]);
      expect(result.dangerouslyAllowLocalIP).toBe(true);
      expect(result.warning).toMatch(/não é uma URL http\/https válida/);
    });

    it.each([['ftp://cdn.example.com/bucket'], ['s3://my-bucket/path']])(
      'development + protocolo não http/https (%s): mesmo comportamento de env inválida',
      (value) => {
        const result = resolveStorageImagesConfig(value, 'development');
        expect(result.dangerouslyAllowLocalIP).toBe(true);
        expect(result.warning).toMatch(/não é uma URL http\/https válida/);
      },
    );

    it('development + localhost válido e explicitamente configurado: permitido, sem warning (não é um fallback)', () => {
      const result = resolveStorageImagesConfig('http://localhost:9000/local-dev-bucket', 'development');

      expect(result).toEqual({
        remotePatterns: [{ protocol: 'http', hostname: 'localhost', port: '9000', pathname: '/local-dev-bucket/**' }],
        dangerouslyAllowLocalIP: true,
        warning: null,
      });
    });

    it('development + host público válido: remotePatterns corretos, dangerouslyAllowLocalIP false, sem warning', () => {
      const result = resolveStorageImagesConfig('https://cdn.example.com/fastcompre-bucket', 'development');

      expect(result).toEqual({
        remotePatterns: [
          { protocol: 'https', hostname: 'cdn.example.com', port: '', pathname: '/fastcompre-bucket/**' },
        ],
        dangerouslyAllowLocalIP: false,
        warning: null,
      });
    });

    it('normaliza uma URL sem path (pathname "/") para "/**", nunca "//**"', () => {
      const result = resolveStorageImagesConfig('https://cdn.example.com', 'development');
      expect(result.remotePatterns[0].pathname).toBe('/**');
    });

    it('normaliza uma URL com barra final da mesma forma que sem barra final', () => {
      const comBarra = resolveStorageImagesConfig('https://cdn.example.com/bucket/', 'development');
      const semBarra = resolveStorageImagesConfig('https://cdn.example.com/bucket', 'development');

      expect(comBarra.remotePatterns[0].pathname).toBe('/bucket/**');
      expect(comBarra.remotePatterns[0].pathname).toBe(semBarra.remotePatterns[0].pathname);
    });

    it.each([['127.0.0.1'], ['0.0.0.0'], ['localhost']])(
      'development + loopback %s: dangerouslyAllowLocalIP habilitado (caso real de dev, next/jest roda sob NODE_ENV=test — ver describe abaixo)',
      (hostname) => {
        const result = resolveStorageImagesConfig(`http://${hostname}:9000/bucket`, 'development');
        expect(result.dangerouslyAllowLocalIP).toBe(true);
      },
    );

    it.each([['10.0.0.5'], ['192.168.1.20'], ['172.16.0.1'], ['172.31.255.255']])(
      'development + IP de faixa privada RFC1918 %s (não é o consumidor real de hoje): dangerouslyAllowLocalIP NÃO habilitado automaticamente',
      (hostname) => {
        // Achado da revisão de segurança: só o loopback realmente usado por
        // `docker-compose.yml` (`localhost:9000`) habilita a flag em dev —
        // generalizar para toda a faixa RFC1918 ampliaria sem necessidade a
        // superfície de host "confiável" pelo Image Optimizer.
        const result = resolveStorageImagesConfig(`http://${hostname}:9000/bucket`, 'development');
        expect(result.dangerouslyAllowLocalIP).toBe(false);
      },
    );

    it.each([
      ['172.15.255.255'], // logo abaixo da faixa privada 172.16.0.0/12
      ['172.32.0.1'], // logo acima da faixa privada 172.16.0.0/12
      ['203.0.113.10'], // TEST-NET-3 (documentação) — público para este propósito
      ['s3.amazonaws.com'],
      ['fastcompre-assets.r2.dev'],
    ])('host público/fora de faixa privada %s nunca habilita dangerouslyAllowLocalIP', (hostname) => {
      const result = resolveStorageImagesConfig(`https://${hostname}/bucket`, 'development');
      expect(result.dangerouslyAllowLocalIP).toBe(false);
    });

    it('o fallback de dev é sempre exatamente DEV_FALLBACK_STORAGE_PUBLIC_URL_BASE já documentado em .env.example', () => {
      expect(DEV_FALLBACK_STORAGE_PUBLIC_URL_BASE).toBe('http://localhost:9000/local-dev-bucket');
    });
  });

  describe("nodeEnv === 'test' — o valor real sob o qual next/jest roda esta suíte — tratado explicitamente como fora de produção, sem enfraquecer a regra de produção", () => {
    it("'test' + env ausente: mesmo fallback de dev de 'development', nunca lança", () => {
      const result = resolveStorageImagesConfig(undefined, 'test');
      expect(result.dangerouslyAllowLocalIP).toBe(true);
      expect(result.warning).toMatch(/não configurada/);
    });

    it("'test' + host público: dangerouslyAllowLocalIP false, nunca lança", () => {
      const result = resolveStorageImagesConfig('https://cdn.example.com/bucket', 'test');
      expect(result.dangerouslyAllowLocalIP).toBe(false);
    });

    it("nodeEnv indefinido (undefined): tratado como fora de produção, mesmo comportamento de 'development'", () => {
      const result = resolveStorageImagesConfig(undefined, undefined);
      expect(result.dangerouslyAllowLocalIP).toBe(true);
      expect(result.warning).toMatch(/não configurada/);
    });
  });

  /**
   * Ajuste de modelagem (revisão de segurança #2): `NODE_ENV=production`
   * também ocorre em um `next build` local — não é sinônimo de "deployment
   * real". Por isso, em produção, só configuração ausente/quebrada lança;
   * uma URL válida NUNCA lança só por o hostname ser local/privado (ela
   * entra normalmente em `remotePatterns`, para que um build local com
   * `STORAGE_PUBLIC_URL_BASE=http://localhost:9000/...` funcione). A
   * proteção real é `dangerouslyAllowLocalIP` — sempre `false` em
   * produção, incondicionalmente, para qualquer hostname.
   */
  describe('produção (NODE_ENV=production) — fail-fast só para configuração ausente/quebrada; dangerouslyAllowLocalIP sempre false', () => {
    it('produção + env ausente (undefined): lança erro de configuração', () => {
      expect(() => resolveStorageImagesConfig(undefined, 'production')).toThrow(
        /STORAGE_PUBLIC_URL_BASE é obrigatória em produção/,
      );
    });

    it('produção + env vazia (""): lança erro de configuração', () => {
      expect(() => resolveStorageImagesConfig('', 'production')).toThrow(
        /STORAGE_PUBLIC_URL_BASE é obrigatória em produção/,
      );
    });

    it('produção + env inválida (não é URL http/https): lança erro de configuração', () => {
      expect(() => resolveStorageImagesConfig('isto não é uma url', 'production')).toThrow(
        /não é uma URL http\/https válida/,
      );
    });

    it.each([['ftp://cdn.example.com/bucket'], ['s3://my-bucket/path']])(
      'produção + protocolo não http/https (%s): lança erro de configuração',
      (value) => {
        expect(() => resolveStorageImagesConfig(value, 'production')).toThrow(/não é uma URL http\/https válida/);
      },
    );

    it('produção + host público válido: permitido em remotePatterns, dangerouslyAllowLocalIP false, sem warning, sem lançar', () => {
      const result = resolveStorageImagesConfig('https://cdn.fastcompre.com.br/prod-bucket', 'production');

      expect(result).toEqual({
        remotePatterns: [
          { protocol: 'https', hostname: 'cdn.fastcompre.com.br', port: '', pathname: '/prod-bucket/**' },
        ],
        dangerouslyAllowLocalIP: false,
        warning: null,
      });
    });

    it('produção + localhost: NÃO lança (next build local legítimo) — permitido em remotePatterns, dangerouslyAllowLocalIP false', () => {
      const result = resolveStorageImagesConfig('http://localhost:9000/local-dev-bucket', 'production');

      expect(result).toEqual({
        remotePatterns: [{ protocol: 'http', hostname: 'localhost', port: '9000', pathname: '/local-dev-bucket/**' }],
        dangerouslyAllowLocalIP: false,
        warning: null,
      });
    });

    it('produção + 127.0.0.1: NÃO lança — permitido em remotePatterns, dangerouslyAllowLocalIP false', () => {
      const result = resolveStorageImagesConfig('http://127.0.0.1:9000/bucket', 'production');

      expect(result.remotePatterns).toEqual([
        { protocol: 'http', hostname: '127.0.0.1', port: '9000', pathname: '/bucket/**' },
      ]);
      expect(result.dangerouslyAllowLocalIP).toBe(false);
    });

    it.each([['10.0.0.5'], ['192.168.1.20'], ['172.16.0.1'], ['172.31.255.255'], ['0.0.0.0']])(
      'produção + IP RFC1918/loopback literal %s: NÃO lança — permitido em remotePatterns, dangerouslyAllowLocalIP false',
      (hostname) => {
        const result = resolveStorageImagesConfig(`http://${hostname}:9000/bucket`, 'production');
        expect(result.remotePatterns[0].hostname).toBe(hostname);
        expect(result.dangerouslyAllowLocalIP).toBe(false);
      },
    );

    it('nenhuma configuração de produção (host público, localhost, loopback ou RFC1918) ativa dangerouslyAllowLocalIP', () => {
      const hosts = [
        'cdn.fastcompre.com.br',
        's3.amazonaws.com',
        'localhost',
        '127.0.0.1',
        '10.0.0.5',
        '192.168.1.20',
        '172.16.0.1',
      ];
      for (const hostname of hosts) {
        const result = resolveStorageImagesConfig(`http://${hostname}:9000/bucket`, 'production');
        expect(result.dangerouslyAllowLocalIP).toBe(false);
      }
    });

    it('produção nunca cai para o fallback de dev — env ausente/inválida lança em vez de retornar DEV_FALLBACK_STORAGE_PUBLIC_URL_BASE', () => {
      // Diferente do caso "produção + localhost" acima (URL válida
      // explicitamente configurada, permitida): aqui a env está
      // ausente/quebrada, o que continua sendo sempre um erro em
      // produção — não há "resultado" a inspecionar, a função lança antes
      // de qualquer remotePatterns ser construído.
      expect(() => resolveStorageImagesConfig(undefined, 'production')).toThrow();
      expect(() => resolveStorageImagesConfig('não é url', 'production')).toThrow();
    });
  });
});
