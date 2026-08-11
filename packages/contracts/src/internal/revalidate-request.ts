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
 * recebe o payload precise montar uma URL a partir dele.
 */
export const revalidateRequestSchema = z.object({
  siteSlug: z.string().min(1),
  articleSlug: z.string().min(1),
});

export type RevalidateRequest = z.infer<typeof revalidateRequestSchema>;
