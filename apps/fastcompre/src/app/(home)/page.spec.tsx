import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { ListPublicArticlesResponse } from '@commerce-platform/contracts';

/**
 * `jest.mock()` (hoistado) não funciona sob o transform SWC do `next/jest`
 * neste projeto — confirmado: um módulo mocado antes do import ainda
 * retornava o real. `jest.doMock()` nunca é hoistado (roda no ponto exato
 * da chamada), então precisa vir antes do `import()` dinâmico do módulo
 * que o consome — mesma disciplina de ordem explícita já usada em
 * `env.spec.ts`. `jest.resetModules()` a cada teste garante que o novo
 * `doMock` valha para a próxima importação, não para uma já cacheada.
 *
 * `connection()` depende de contexto interno de requisição do Next.js, que
 * não existe rodando via Jest puro — mocado para não testar o Next em si,
 * só o comportamento desta página. UXW-012 — `next/navigation` (`notFound`)
 * também é mocado agora: a Home lê `searchParams` e chama `notFound()`
 * para paginação inválida/fora do range (ver `page.tsx`).
 *
 * UXW-007 — `page.tsx` moveu de `apps/fastcompre/src/app/page.tsx` para
 * `apps/fastcompre/src/app/(home)/page.tsx` (Route Group `(home)`, para
 * isolar `loading.tsx`/`error.tsx` da Home sem afetar Categoria/Artigo —
 * ver aqueles arquivos). `(home)` não aparece na URL (é convenção de
 * organização, não de rota) — `/` continua resolvendo para este arquivo.
 * O import relativo do client da API pública mudou de `../lib/...` para
 * `../../lib/...` por causa do nível extra de pasta.
 *
 * UXW-013 — `next/image` também precisa de `jest.doMock()` (mesma
 * disciplina acima, mesma razão): `Image` chama `useContext` internamente
 * (`ImageConfigContext`) e quebra sob o mesmo padrão `resetModules()` +
 * `import()` dinâmico já documentado para `next/link` na UXW-012 (duas
 * cópias de React — a instância de `Image` importada dinamicamente por
 * `page.tsx` não enxerga o dispatcher da instância de `react-dom` usada
 * estaticamente por este arquivo de teste). O duplo (padrão recomendado
 * pela própria documentação do Next.js para testes) renderiza um `<img>`
 * simples com as props relevantes — inclusive `data-preload`, já que um
 * `<img>` não tem prop `preload` real — para os testes desta suíte
 * continuarem verificando exatamente o que é responsabilidade desta
 * página (que props ela passa para `next/image`), não a implementação
 * interna do próprio `next/image` (otimização, `<link rel="preload">`
 * real etc., fora do escopo de um teste unitário desta página).
 */
interface MockNextImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  sizes?: string;
  preload?: boolean;
  className?: string;
}

describe('Home', () => {
  afterEach(() => {
    jest.resetModules();
  });

  function mockHomeDependencies(result: ListPublicArticlesResponse) {
    jest.doMock('next/server', () => ({ connection: jest.fn(() => Promise.resolve()) }));
    jest.doMock('next/navigation', () => ({
      notFound: jest.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
      }),
    }));
    jest.doMock('next/image', () => ({
      __esModule: true,
      default: ({ src, alt, width, height, sizes, preload, className }: MockNextImageProps) => (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          className={className}
          data-preload={preload ? 'true' : undefined}
        />
      ),
    }));
    jest.doMock('../../lib/public-api/client', () => ({
      listPublicArticles: jest.fn(() => Promise.resolve(result)),
    }));
  }

  async function renderHomeWith(
    result: ListPublicArticlesResponse,
    rawPage?: string | string[],
  ): Promise<string> {
    mockHomeDependencies(result);
    const { default: Home } = await import('./page');
    return renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ page: rawPage }) }));
  }

  function article(overrides: {
    id: string;
    title: string;
    coverImageUrl: string | null;
    metaDescription?: string | null;
  }) {
    return {
      id: overrides.id,
      categorySlug: 'comparativos',
      type: 'COMPARISON' as const,
      title: overrides.title,
      slug: overrides.title.toLowerCase().replace(/\s+/g, '-'),
      metaDescription: overrides.metaDescription ?? null,
      coverImageUrl: overrides.coverImageUrl,
      publishedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  function extractImgTags(html: string): string[] {
    return html.match(/<img[^>]*>/g) ?? [];
  }

  function countHeadingTags(html: string, level: 1 | 2): number {
    return (html.match(new RegExp(`<h${level}[^>]*>`, 'g')) ?? []).length;
  }

  it('renderiza os artigos retornados pela API pública', async () => {
    const html = await renderHomeWith({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          categorySlug: 'comparativos',
          type: 'COMPARISON',
          title: 'Melhor fone bluetooth 2026',
          slug: 'melhor-fone-bluetooth',
          metaDescription: 'Comparativo dos melhores fones bluetooth.',
          coverImageUrl: 'https://example.com/cover.jpg',
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    expect(html).toContain('Melhor fone bluetooth 2026');
    expect(html).toContain('/comparativos/melhor-fone-bluetooth');
    // `timeZone: 'UTC'` faz a formatação ser determinística entre ambientes;
    // sem isso, '2026-01-01T00:00:00.000Z' poderia virar 31 de dezembro de
    // 2025 dependendo do timezone da máquina que roda o teste.
    expect(html).toContain('01 de janeiro de 2026');
  });

  it('mostra estado vazio quando não há artigos publicados', async () => {
    const html = await renderHomeWith({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });

    expect(html).toContain('Nenhum artigo publicado ainda.');
  });

  /**
   * Refinamento visual pré-UXW-015 (desenho técnico aprovado pelo Product
   * Owner, referência visual `testeLayout.png`) — hero editorial para
   * `items[0]`. Cobre exatamente os três pontos fechados na aprovação:
   * hero sem imagem em versão textual (nunca pula para outro artigo),
   * `<h2>` do hero preservando um único `<h1>` na página, e o candidato a
   * `preload` continuando independente da posição do hero.
   */
  describe('hero editorial (refinamento pré-UXW-015)', () => {
    it('destaca items[0] como hero e preserva um único <h1> na página', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Artigo em destaque', coverImageUrl: 'https://example.com/1.jpg' }),
          article({ id: '2', title: 'Segundo artigo', coverImageUrl: null }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });

      // Um único <h1> na página (o wordmark "FastCompre") — o título do
      // hero é <h2>, nunca um segundo <h1>.
      expect(countHeadingTags(html, 1)).toBe(1);
      expect(html).toContain('<h1 class="text-3xl font-semibold text-fg">FastCompre</h1>');

      // items[0] é o hero: aparece antes de items[1] no HTML.
      const heroIndex = html.indexOf('Artigo em destaque');
      const secondIndex = html.indexOf('Segundo artigo');
      expect(heroIndex).toBeGreaterThan(-1);
      expect(secondIndex).toBeGreaterThan(heroIndex);
    });

    it('renderiza o hero em versão textual quando items[0].coverImageUrl é null, sem pular para outro artigo', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Hero sem imagem', coverImageUrl: null }),
          article({ id: '2', title: 'Com imagem', coverImageUrl: 'https://example.com/2.jpg' }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });

      // O hero continua sendo items[0] (aparece primeiro), mesmo sem
      // imagem — nunca "promove" items[1] à posição de hero.
      const heroIndex = html.indexOf('Hero sem imagem');
      const secondIndex = html.indexOf('Com imagem');
      expect(heroIndex).toBeGreaterThan(-1);
      expect(secondIndex).toBeGreaterThan(heroIndex);

      // Só a imagem de items[1] é renderizada (a única com coverImageUrl);
      // o candidato a preload é ela, não o hero (que não tem imagem
      // nenhuma para receber preload).
      const imgTags = extractImgTags(html);
      expect(imgTags).toHaveLength(1);
      expect(imgTags[0]).toContain('src="https://example.com/2.jpg"');
      expect(imgTags[0]).toContain('data-preload="true"');
    });

    it('não duplica items[0] na grade abaixo do hero', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Único artigo em destaque', coverImageUrl: null }),
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });

      // Com um único artigo publicado, ele aparece só como hero — nenhuma
      // grade abaixo, nenhum <h2> duplicado com o mesmo título.
      const titleOccurrences = html.split('Único artigo em destaque').length - 1;
      expect(titleOccurrences).toBe(1);
      expect(countHeadingTags(html, 2)).toBe(1);
    });

    it('aplica font-editorial ao título do hero e ao título dos cards da listagem', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Título do hero', coverImageUrl: null }),
          article({ id: '2', title: 'Título do card', coverImageUrl: null }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });

      expect(html).toContain('<h2 class="font-editorial text-2xl font-semibold text-fg group-hover:text-accent md:text-3xl">Título do hero</h2>');
      expect(html).toContain('<h2 class="font-editorial text-xl font-semibold text-fg group-hover:text-accent">Título do card</h2>');
    });
  });

  /**
   * Refinamento visual pós-`testeLayout.png` (decisão final do PO) — a
   * pilha vertical de 1 coluna dos artigos restantes (abaixo do hero) virou
   * um grid responsivo (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`,
   * `gap-10`). Cobre exatamente o que foi fechado nesta rodada:
   * `<ul>/<li>` preservados, ordem do DOM preservada (nenhum `order` do
   * CSS Grid/Flex em nenhum lugar — a ordem visual é sempre a ordem do
   * `.map()`, que é a ordem em que a API pública já devolve os artigos).
   */
  describe('grid responsivo dos artigos restantes (refinamento pós-testeLayout.png)', () => {
    it('renderiza os artigos restantes num <ul> com grid-cols-1 md:grid-cols-2 lg:grid-cols-3, preservando a ordem do DOM', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Hero', coverImageUrl: null }),
          article({ id: '2', title: 'Primeiro do grid', coverImageUrl: null }),
          article({ id: '3', title: 'Segundo do grid', coverImageUrl: null }),
        ],
        page: 1,
        pageSize: 20,
        total: 3,
        totalPages: 1,
      });

      expect(html).toContain('<ul class="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10 lg:grid-cols-3">');

      // Ordem do DOM preservada — nenhum `order` do CSS Grid/Flex é usado
      // em nenhum lugar deste componente; a ordem dos <li> no HTML continua
      // sendo exatamente a ordem de `remainingArticles` (mesmo `.map()` de
      // antes desta tarefa).
      const firstIndex = html.indexOf('Primeiro do grid');
      const secondIndex = html.indexOf('Segundo do grid');
      expect(firstIndex).toBeGreaterThan(-1);
      expect(secondIndex).toBeGreaterThan(firstIndex);
    });

    it('não renderiza o <ul> do grid quando não há artigos além do hero', async () => {
      const html = await renderHomeWith({
        items: [article({ id: '1', title: 'Único artigo', coverImageUrl: null })],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });

      expect(html).not.toContain('grid grid-cols-1');
    });
  });

  /**
   * Correção de LCP (UXW-006): só a primeira imagem da listagem com
   * `coverImageUrl` pode receber prioridade de carregamento — nunca
   * `index === 0` cru, porque `coverImageUrl` é opcional. UXW-013 trocou o
   * mecanismo de `loading="eager"`/`fetchPriority="high"` manuais pelo prop
   * `preload` do `next/image` (Next 16 — `priority` está deprecated); o
   * duplo de teste de `next/image` (topo do arquivo) expõe isso como
   * `data-preload="true"`, já que um `<img>` não tem prop `preload` real —
   * os testes abaixo passam a verificar essa marca, não mais os atributos
   * antigos, mas a MESMA regra de negócio (só a primeira imagem real).
   * Refinamento pré-UXW-015: o candidato a preload continua calculado
   * sobre `items` inteiro, independente do hero (ver descrição da
   * suíte acima) — estes testes continuam válidos sem alteração, já que
   * `items[0]` aqui sempre tem imagem (logo é o próprio candidato).
   */
  describe('prioridade de carregamento da imagem LCP', () => {
    it('aplica preload somente na primeira imagem, mantendo as demais sem preload', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Primeiro artigo', coverImageUrl: 'https://example.com/1.jpg' }),
          article({ id: '2', title: 'Segundo artigo', coverImageUrl: 'https://example.com/2.jpg' }),
          article({ id: '3', title: 'Terceiro artigo', coverImageUrl: 'https://example.com/3.jpg' }),
        ],
        page: 1,
        pageSize: 20,
        total: 3,
        totalPages: 1,
      });

      const imgTags = extractImgTags(html);
      expect(imgTags).toHaveLength(3);

      expect(imgTags[0]).toContain('src="https://example.com/1.jpg"');
      expect(imgTags[0]).toContain('data-preload="true"');

      for (const tag of imgTags.slice(1)) {
        expect(tag).not.toContain('data-preload');
      }
    });

    it('aplica a prioridade na primeira imagem REAL quando o primeiro artigo da lista não tem coverImageUrl', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Sem imagem', coverImageUrl: null }),
          article({ id: '2', title: 'Com imagem', coverImageUrl: 'https://example.com/2.jpg' }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });

      const imgTags = extractImgTags(html);
      expect(imgTags).toHaveLength(1);
      expect(imgTags[0]).toContain('src="https://example.com/2.jpg"');
      expect(imgTags[0]).toContain('data-preload="true"');
    });

    it('não aplica preload a nenhuma imagem quando nenhum artigo tem coverImageUrl', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Sem imagem 1', coverImageUrl: null }),
          article({ id: '2', title: 'Sem imagem 2', coverImageUrl: null }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });

      expect(extractImgTags(html)).toHaveLength(0);
      expect(html).not.toContain('data-preload');
    });

    it('inclui o `sizes` do hero (largura cheia do container) quando ele é a única imagem renderizada', async () => {
      const html = await renderHomeWith({
        items: [article({ id: '1', title: 'Primeiro artigo', coverImageUrl: 'https://example.com/1.jpg' })],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });

      const imgTags = extractImgTags(html);
      expect(imgTags[0]).toContain('sizes="(min-width: 768px) 672px, calc(100vw - 32px)"');
    });

    /**
     * Refinamento visual pós-`testeLayout.png` (decisão final do PO) —
     * `ARTICLE_CARD_IMAGE_SIZES` foi recalibrado para descrever uma coluna
     * do grid, não mais o container inteiro; o hero (fora do grid) passou
     * a usar `HOME_HERO_IMAGE_SIZES`, um valor independente. Este teste
     * verifica os dois `sizes` na mesma renderização, para deixar explícito
     * que são valores DIFERENTES e cada imagem recebe o seu.
     *
     * Correção final de composição (decisão fechada do PO): ambos os
     * valores foram recalibrados nesta rodada — o hero passou a ser uma
     * composição em duas zonas (`HOME_HERO_IMAGE_SIZES`, 672px em vez de
     * 736px) e o container/grid ficaram mais largos (`ARTICLE_CARD_IMAGE_SIZES`,
     * 347px/476px em vez de 219px/348px) — ver `../article-card-image-sizes.ts`.
     */
    it('usa sizes diferentes para o hero (fora do grid) e para o card do grid (refinamento pós-testeLayout.png)', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Hero', coverImageUrl: 'https://example.com/1.jpg' }),
          article({ id: '2', title: 'Card do grid', coverImageUrl: 'https://example.com/2.jpg' }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });

      const imgTags = extractImgTags(html);
      expect(imgTags).toHaveLength(2);

      // imgTags[0] — hero, composição em duas zonas a partir de md: (~60%
      // do container no teto de max-w-6xl).
      expect(imgTags[0]).toContain('sizes="(min-width: 768px) 672px, calc(100vw - 32px)"');
      // imgTags[1] — card do grid, largura de uma coluna (476px em md:,
      // 347px em lg: — ver `../article-card-image-sizes.ts`).
      expect(imgTags[1]).toContain(
        'sizes="(min-width: 1024px) 347px, (min-width: 768px) 476px, calc(100vw - 32px)"',
      );
    });

    it('preserva o comportamento atual quando nenhum artigo tem coverImageUrl (nenhuma imagem, nenhum crash)', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Sem imagem 1', coverImageUrl: null }),
          article({ id: '2', title: 'Sem imagem 2', coverImageUrl: null }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });

      expect(extractImgTags(html)).toHaveLength(0);
      expect(html).toContain('Sem imagem 1');
      expect(html).toContain('Sem imagem 2');
    });
  });

  /**
   * UXW-012 — Paginação consistente. `listPublicArticles` é mocado para
   * devolver sempre o `result` informado, independentemente dos argumentos
   * — exceto no primeiro teste abaixo, que inspeciona diretamente a
   * chamada para confirmar que `page` é repassado corretamente.
   */
  describe('paginação (UXW-012)', () => {
    it('repassa a página solicitada (?page=N) para listPublicArticles', async () => {
      const listPublicArticlesMock = jest.fn<
        (query?: { page?: number }) => Promise<ListPublicArticlesResponse>
      >();
      listPublicArticlesMock.mockResolvedValue({
        items: [],
        page: 2,
        pageSize: 20,
        total: 25,
        totalPages: 2,
      });
      jest.doMock('next/server', () => ({ connection: jest.fn(() => Promise.resolve()) }));
      jest.doMock('next/navigation', () => ({
        notFound: jest.fn(() => {
          throw new Error('NEXT_NOT_FOUND');
        }),
      }));
      jest.doMock('../../lib/public-api/client', () => ({ listPublicArticles: listPublicArticlesMock }));

      const { default: Home } = await import('./page');
      await Home({ searchParams: Promise.resolve({ page: '2' }) });

      expect(listPublicArticlesMock).toHaveBeenCalledWith({ page: 2 });
    });

    it('gera um link "limpo" (sem ?page=1) de volta para a página 1 quando a página atual é outra', async () => {
      // A página atual nunca é um link para si mesma (é um <span>) — para
      // verificar o href "limpo" da página 1, é preciso renderizar a partir
      // de outra página (aqui, a 2), de onde "Anterior"/o número "1" de
      // fato apontam de volta para a página 1.
      const html = await renderHomeWith(
        { items: [], page: 2, pageSize: 20, total: 25, totalPages: 2 },
        '2',
      );

      expect(html).toContain('href="/"');
      expect(html).not.toContain('page=1');
    });

    it('renderiza os controles de paginação na última página, com aria-current e sem link "Próxima"', async () => {
      const html = await renderHomeWith(
        { items: [], page: 2, pageSize: 20, total: 25, totalPages: 2 },
        '2',
      );

      expect(html).toContain('aria-current="page"');
      expect(html).not.toContain('Próxima');
      expect(html).toContain('Anterior');
    });

    it('não renderiza nenhum controle de paginação quando há só uma página', async () => {
      const html = await renderHomeWith({ items: [], page: 1, pageSize: 20, total: 1, totalPages: 1 });

      expect(html).not.toContain('aria-label="Paginação"');
      expect(html).not.toContain('Anterior');
    });

    it('nenhuma URL de paginação gerada contém pageSize', async () => {
      const html = await renderHomeWith({ items: [], page: 1, pageSize: 20, total: 45, totalPages: 3 });

      expect(html).not.toContain('pageSize');
    });

    it.each([['0'], ['-1'], ['1.5'], ['abc'], [['1', '2']]])(
      'chama notFound() quando ?page= é malformado (%p)',
      async (rawPage) => {
        await expect(
          renderHomeWith({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }, rawPage as string | string[]),
        ).rejects.toThrow('NEXT_NOT_FOUND');
      },
    );

    it('chama notFound() quando a página pedida está acima de totalPages', async () => {
      await expect(
        renderHomeWith({ items: [], page: 3, pageSize: 20, total: 20, totalPages: 2 }, '3'),
      ).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it('chama notFound() quando não há nenhum artigo e a página pedida é maior que 1', async () => {
      await expect(
        renderHomeWith({ items: [], page: 2, pageSize: 20, total: 0, totalPages: 0 }, '2'),
      ).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it('NÃO chama notFound() na página 1 quando não há nenhum artigo (estado vazio legítimo)', async () => {
      const html = await renderHomeWith({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });

      expect(html).toContain('Nenhum artigo publicado ainda.');
    });
  });

  /**
   * UXW-007, ajuste solicitado nesta implementação: `shell.integration
   * .spec.tsx` só roda `jest-axe` com a Home vazia (`ARTICLES: total 0`) —
   * nunca com cards populados/imagem real. Este bloco fecha essa lacuna
   * especificamente para a Home, montando a árvore real (não HTML
   * estático, por isso `render()`/Testing Library aqui em vez de
   * `renderToStaticMarkup`) com um artigo com e um artigo sem imagem, para
   * cobrir os dois formatos de card num único gate de acessibilidade.
   * UXW-012 — `totalPages: 2` (em vez de `1`) faz os controles de
   * paginação novos entrarem neste mesmo gate, não só no spec isolado de
   * `pagination.spec.tsx`. Refinamento pré-UXW-015: o primeiro artigo
   * populado aqui vira o hero (com imagem); o segundo vira o único card
   * da grade abaixo (sem imagem) — mesmos dois formatos de card cobertos
   * de antes, agora incluindo o hero no mesmo gate.
   */
  describe('acessibilidade (jest-axe) — Home populada', () => {
    it('não tem violação de acessibilidade com cards com e sem imagem, e paginação visível', async () => {
      mockHomeDependencies({
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            categorySlug: 'comparativos',
            type: 'COMPARISON',
            title: 'Melhor fone bluetooth 2026',
            slug: 'melhor-fone-bluetooth',
            metaDescription: 'Comparativo dos melhores fones bluetooth.',
            coverImageUrl: 'https://example.com/cover.jpg',
            publishedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            categorySlug: 'cafeteiras',
            type: 'COMPARISON',
            title: 'Melhor cafeteira 2026',
            slug: 'melhor-cafeteira',
            metaDescription: null,
            coverImageUrl: null,
            publishedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        page: 1,
        pageSize: 20,
        total: 3,
        totalPages: 2,
      });

      const { default: Home } = await import('./page');
      // Mesma técnica de `shell.integration.spec.tsx`: chamar o Server
      // Component `async` diretamente (`await Home()`) devolve um elemento
      // React de verdade, montável via `render()` — diferente de
      // `renderToStaticMarkup`, que só serve para comparação de HTML
      // estático, não para rodar `jest-axe` (que precisa de um container
      // DOM real).
      const home = await Home({ searchParams: Promise.resolve({}) });
      const { container } = render(home);

      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
