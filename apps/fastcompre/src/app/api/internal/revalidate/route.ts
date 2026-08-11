import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { revalidateRequestSchema } from '@commerce-platform/contracts';
import { env } from '@/lib/env';

const REVALIDATION_SECRET_HEADER = 'x-revalidation-secret';

/**
 * Recebe pedidos de revalidação de cache vindos da API, autenticados por um
 * segredo compartilhado em header — nunca por sessão de usuário, já que
 * quem chama esta rota é outro servidor, não um navegador. O segredo é
 * conferido antes de qualquer parsing do corpo da requisição: uma chamada
 * não autenticada não deve fazer este endpoint processar nada do que foi
 * enviado.
 *
 * `siteSlug` no payload não participa da autenticação — é conferido contra
 * `env.SITE_SLUG` só para garantir que a mensagem foi endereçada ao
 * deployment certo, já que cada deployment do FastCompre representa
 * exatamente um Site.
 *
 * Cada deployment serve um único Site, então revalidar toda a árvore de
 * rotas sob o layout raiz é suficiente para refletir qualquer mudança de
 * conteúdo público, sem precisar identificar a URL exata de um Artigo.
 * `sitemap.xml` é revalidado à parte porque essa rota tem cache próprio,
 * fora da árvore de componentes cobertos pela revalidação de layout.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get(REVALIDATION_SECRET_HEADER);
  if (secret !== env.REVALIDATION_SECRET) {
    return NextResponse.json({ error: 'INVALID_SECRET' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = revalidateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  if (parsed.data.siteSlug !== env.SITE_SLUG) {
    return NextResponse.json({ error: 'SITE_SLUG_MISMATCH' }, { status: 400 });
  }

  revalidatePath('/', 'layout');
  revalidatePath('/sitemap.xml');

  return NextResponse.json({ revalidated: true }, { status: 200 });
}
