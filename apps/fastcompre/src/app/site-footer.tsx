/**
 * apps/fastcompre/src/app/site-footer.tsx
 *
 * UXW-002 — Footer público do FastCompre: divulgação de afiliação sempre
 * visível nas 3 rotas públicas (UX-Implementation-Backlog.md, UXW-002;
 * Architecture.md, Seção 33 — exigência legal do Código de Defesa do
 * Consumidor e das políticas dos programas de afiliado, não apenas boa
 * prática de SEO).
 *
 * Server Component puro — sem `"use client"`, estado, fetch ou qualquer
 * JavaScript client-side: a divulgação é texto estático, sempre presente,
 * sem exigir interação para aparecer (critério de aceite da UXW-002).
 *
 * Texto aprovado explicitamente pelo Product Owner nesta tarefa — divulga a
 * mesma informação já presente no parágrafo específico da página de Artigo
 * (`[categorySlug]/[articleSlug]/page.tsx`), reescrita no nível do site em
 * vez do artigo, para fazer sentido nas 3 rotas (Home/Categoria não têm um
 * artigo em foco). O parágrafo do Artigo permanece inalterado por decisão
 * explícita do Product Owner — a duplicidade de divulgação na página de
 * Artigo (footer global + parágrafo específico do artigo) é aceita
 * conscientemente nesta etapa, não é um efeito colateral não avaliado desta
 * implementação.
 *
 * Cor do texto: `text-fg-muted` (→ `--color-text-muted` →
 * `--color-neutral-600`), nunca `neutral-500` — `semantic-colors.css`
 * (UXF-001) já documenta que `neutral-500` fica abaixo de 4.5:1 e que
 * `neutral-600` é o piso validado para texto de tamanho normal. Nenhum
 * token novo introduzido.
 *
 * Sem `<nav>`, link, ou qualquer outro elemento — nenhuma funcionalidade
 * fora do escopo da UXW-002 (navegação, Categorias, links sociais,
 * newsletter, menu, drawer) foi adicionada.
 *
 * Largura de leitura (`max-w-3xl`) e espaçamento (`px-4 py-8`) são Tailwind
 * puro local, mesmo padrão já usado por `SiteHeader`/`page.tsx` — decisão já
 * registrada na UXW-001 de manter isso local/reversível em vez de um
 * `Container` de `packages/ui`, sem segundo consumidor real que a
 * justifique agora.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-outline-subtle">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="font-ui text-body-sm text-fg-muted">
          Este site contém links de afiliados. Podemos ganhar uma comissão sobre compras qualificadas, sem custo adicional para você.
        </p>
      </div>
    </footer>
  );
}
