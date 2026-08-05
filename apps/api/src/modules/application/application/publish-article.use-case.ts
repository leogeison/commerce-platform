import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';
import { MarkArticleAsPublishedUseCase } from '../../editorial/application/mark-article-as-published.use-case';
import type { Article, ArticleStatus } from '../../../generated/prisma/client';
import { CalculateArticleHealthUseCase, type ArticleHealth } from './calculate-article-health.use-case';

export type PublicationIssue =
  | 'WRONG_STATUS'
  | 'CATEGORY_INACTIVE'
  | 'NO_PRODUCTS'
  | 'PRODUCT_WITHOUT_VALID_OFFER'
  | 'SLUG_NOT_UNIQUE'
  | 'META_DESCRIPTION_MISSING'
  | 'COVER_IMAGE_MISSING';

export interface PublishArticleInput {
  siteId: string;
  articleId: string;
}

export type PublishArticleResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'VALIDATION_FAILED'; issues: PublicationIssue[] };

/**
 * Publica um Artigo (APP-002) — operação INTERNA, **sem controller HTTP
 * próprio** (Architecture.md: "nenhuma operação interna de publicação ou
 * arquivamento tem controller HTTP próprio"). O único caminho HTTP de
 * publicação, quando existir, é `POST /publish → REV-003 → APP-002 →
 * EDT-014 → REV-002` — expor esta classe direto por uma rota permitiria
 * publicar sem revalidar. `apps/api/test/article-publish-archive-not-reachable.e2e-spec.ts`
 * (EDT-018) já prova, via HTTP real, que `POST .../articles/:id/publish`
 * não existe — nenhum teste de metadata adicional é necessário aqui.
 *
 * Reaproveita `CalculateArticleHealthUseCase` (APP-001) para as 6
 * condições editoriais (Categoria ativa, ≥1 Produto, Oferta válida por
 * Produto, slug único, `metaDescription`, capa) — fonte única dessas
 * regras; só a checagem de `status === PENDING_REVIEW` é adicionada aqui,
 * por cima, já que `/health` é deliberadamente status-agnóstico.
 *
 * Publica só quando `issues` estiver vazio; senão devolve a lista exata
 * do que falta, sem chamar `EDT-014`.
 *
 * **Sem transação cobrindo os 4 passos** (ler status, calcular saúde,
 * decidir, publicar): o cálculo representa um "snapshot lógico" do
 * momento da checagem, não uma leitura consistente ponta a ponta com a
 * escrita. `EDT-014` garante atomicidade só da própria transição
 * (`status` + `publishedAt` na mesma instrução SQL) — não existe uma
 * transação única amarrando isso às condições cross-domain (Categoria,
 * Produto, Oferta). Aceitável por desenho: cada condição individual já é
 * tolerante a mudança posterior (Architecture.md §12 — um Produto perder
 * Oferta válida depois de publicado não despublica o Artigo, só fica
 * sinalizado via `/health`); a pior consequência de uma corrida entre a
 * checagem e a escrita é `EDT-014` devolver `WRONG_STATUS`/`NOT_FOUND`
 * (tratado abaixo), nunca um estado inconsistente persistido.
 */
@Injectable()
export class PublishArticleUseCase {
  constructor(
    private readonly articleRepository: PrismaArticleRepository,
    private readonly calculateArticleHealthUseCase: CalculateArticleHealthUseCase,
    private readonly markArticleAsPublishedUseCase: MarkArticleAsPublishedUseCase,
  ) {}

  async execute(input: PublishArticleInput): Promise<PublishArticleResult> {
    const article = await this.articleRepository.findOneBySite(input.siteId, input.articleId);

    if (!article) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const healthResult = await this.calculateArticleHealthUseCase.execute({
      siteId: input.siteId,
      articleId: input.articleId,
    });

    if (!healthResult.ok) {
      // Defensivo: o Artigo já foi confirmado acima; hoje não há como um
      // Artigo desaparecer entre as duas chamadas (nunca é excluído
      // fisicamente, só arquivado). Se acontecer, propaga o mesmo
      // NOT_FOUND, sem inventar um terceiro motivo.
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const issues = collectPublicationIssues(article.status, healthResult.health);

    if (issues.length > 0) {
      return { ok: false, reason: 'VALIDATION_FAILED', issues };
    }

    const publishResult = await this.markArticleAsPublishedUseCase.execute({
      siteId: input.siteId,
      id: input.articleId,
    });

    if (!publishResult.ok) {
      // Janela de corrida entre a checagem acima e esta escrita (ex.:
      // outra requisição reverteu o Artigo para DRAFT nesse meio-tempo).
      // Nunca vaza o motivo interno do EDT-014 — traduz de volta para o
      // vocabulário de APP-002.
      if (publishResult.reason === 'NOT_FOUND') {
        return { ok: false, reason: 'NOT_FOUND' };
      }

      return { ok: false, reason: 'VALIDATION_FAILED', issues: ['WRONG_STATUS'] };
    }

    return { ok: true, article: publishResult.article };
  }
}

/**
 * Traduz `status` + `ArticleHealth` em `PublicationIssue[]`. A ordem do
 * resultado é garantida pela sequência de `if`/`push` abaixo — nunca pela
 * ordem de declaração do tipo `PublicationIssue` (uniões TypeScript não
 * têm ordem em tempo de execução) — determinística independente de quais
 * condições falharam.
 */
function collectPublicationIssues(status: ArticleStatus, health: ArticleHealth): PublicationIssue[] {
  const issues: PublicationIssue[] = [];

  if (status !== 'PENDING_REVIEW') {
    issues.push('WRONG_STATUS');
  }
  if (!health.categoryActive) {
    issues.push('CATEGORY_INACTIVE');
  }
  if (!health.hasAtLeastOneProduct) {
    issues.push('NO_PRODUCTS');
  }
  if (!health.allProductsHaveValidOffer) {
    issues.push('PRODUCT_WITHOUT_VALID_OFFER');
  }
  if (!health.slugUnique) {
    issues.push('SLUG_NOT_UNIQUE');
  }
  if (!health.metaDescriptionFilled) {
    issues.push('META_DESCRIPTION_MISSING');
  }
  if (!health.coverImagePresent) {
    issues.push('COVER_IMAGE_MISSING');
  }

  return issues;
}
