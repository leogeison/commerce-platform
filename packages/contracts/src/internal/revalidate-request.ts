import { z } from 'zod';

/**
 * Payload enviado pela API ao endpoint interno de revalidação do FastCompre.
 *
 * `siteSlug` não autentica nada por si só (isso é papel do segredo
 * compartilhado, verificado antes do payload sequer ser parseado) — serve
 * só para confirmar que a mensagem chegou ao deployment correto, já que
 * cada deployment do FastCompre representa exatamente um Site.
 *
 * `articleSlug` identifica o Artigo que motivou a revalidação, para fins de
 * rastreabilidade de quem chama este contrato — não implica que quem
 * recebe o payload precise montar uma URL a partir dele. Opcional desde a
 * UXF-010A: `RevalidateCategoryUseCase` revalida por `siteSlug` sem
 * descobrir Artigos afetados individualmente, então não tem um
 * `articleSlug` para enviar. Quando presente, continua obedecendo
 * `min(1)` — o campo nunca vira string vazia.
 */
export const revalidateRequestSchema = z.object({
  siteSlug: z.string().min(1),
  articleSlug: z.string().min(1).optional(),
});

export type RevalidateRequest = z.infer<typeof revalidateRequestSchema>;
