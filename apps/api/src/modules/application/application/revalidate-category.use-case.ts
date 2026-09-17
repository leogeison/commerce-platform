import { Inject, Injectable, Logger } from '@nestjs/common';
import { REVALIDATION_PORT, type RevalidationPort } from '../../revalidation/domain/revalidation.port';

export interface RevalidateCategoryInput {
  siteId: string;
  siteSlug: string;
  categoryId: string;
}

/**
 * Coordenação de revalidação específica de Categoria (UXF-010A) — mecanismo
 * separado de `RevalidateAffectedArticlesUseCase.revalidateForCategory`,
 * que continua existindo intocada (junto de `findByCategory`, sem
 * consumidor depois desta tarefa) para não misturar as duas estratégias
 * numa única classe.
 *
 * Diferença de escopo: `RevalidateAffectedArticlesUseCase.revalidateForCategory`
 * descobria os Artigos publicados afetados (via APP-005) e revalidava um a
 * um, com `articleSlug`. Esta classe não descobre nada — a UXW-001
 * redesenhou a página de Categoria do FastCompre para ler o catálogo ao
 * vivo (Server Component, sem cache de página por Artigo dependente), então
 * uma mudança em Categoria não precisa mais localizar Artigos individuais
 * para invalidar: um único `REVALIDATION_PORT.revalidate({ siteSlug })`
 * (sem `articleSlug`, agora opcional em `revalidateRequestSchema`) já cobre
 * o efeito da UXF-010A.
 *
 * Mesma disciplina de "nunca propagar falha" dos demais orquestradores de
 * revalidação: como a mutação de origem (create/rename/archive/unarchive)
 * já está persistida no momento em que `execute()` roda, uma falha aqui
 * nunca deve virar erro HTTP para quem já teve sua escrita bem-sucedida —
 * `try/catch` best-effort, log estruturado, nunca relança. `Promise<void>`
 * sempre resolve.
 */
@Injectable()
export class RevalidateCategoryUseCase {
  private readonly logger = new Logger(RevalidateCategoryUseCase.name);

  constructor(@Inject(REVALIDATION_PORT) private readonly revalidationPort: RevalidationPort) {}

  async execute(input: RevalidateCategoryInput): Promise<void> {
    try {
      await this.revalidationPort.revalidate({ siteSlug: input.siteSlug });
    } catch (error) {
      this.logger.error(
        {
          siteId: input.siteId,
          resource: 'category',
          resourceId: input.categoryId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Falha ao revalidar cache após alteração em Categoria.',
      );
    }
  }
}
