import Link from 'next/link';
import { listPublicCategories } from '@/lib/public-api/client';

/**
 * apps/fastcompre/src/app/site-footer.tsx
 *
 * UXW-002 — Footer público do FastCompre: divulgação de afiliação sempre
 * visível nas 3 rotas públicas (UX-Implementation-Backlog.md, UXW-002;
 * Architecture.md, Seção 33 — exigência legal do Código de Defesa do
 * Consumidor e das políticas dos programas de afiliado, não apenas boa
 * prática de SEO).
 *
 * Texto de disclosure aprovado explicitamente pelo Product Owner na UXW-002
 * — divulga a mesma informação que, até a UXW-010A, também aparecia num
 * parágrafo específico da página de Artigo. UXW-010A — este `SiteFooter`
 * é a única fonte canônica de disclosure sitewide (o parágrafo específico
 * do Artigo foi removido naquela tarefa). Texto do disclosure INTOCADO por
 * esta rodada.
 *
 * Refinamento visual (rodada isolada, pós-correção final de composição,
 * decisão fechada do PO — "transformar o footer num fechamento visual real
 * da página") — `SiteFooter` deixa de ser um Server Component síncrono e
 * passa a ser `async`, buscando Categorias via `listPublicCategories()`
 * (`lib/public-api/client.ts`) — MESMO padrão já estabelecido por
 * `SiteHeader` (UXW-003): nenhum novo endpoint/contrato, mesma função de
 * fetch já existente, mesma degradação graciosa (`try/catch`; falha de
 * rede/HTTP ou lista vazia → coluna "Categorias" simplesmente omitida, sem
 * propagar erro, resto do footer continua funcional). `layout.tsx` já
 * compõe `<SiteHeader />` (também async) como Server Component real —
 * Next.js resolve os dois normalmente em produção; a única consequência é
 * nos testes (ver `site-footer.spec.tsx`/`site-header.spec.tsx`/
 * `shell.integration.spec.tsx`: precisam invocar `await SiteFooter()`, não
 * `<SiteFooter />` como JSX, mesma disciplina já usada para `SiteHeader`).
 *
 * Duas fontes de dados REAIS, nenhum link/copy inventado:
 * - Categorias: mesma lista/mesma função de fetch que `SiteHeader` já usa
 *   (`listPublicCategories()`) — nunca uma segunda fonte de verdade.
 * - Frase de apoio: reaproveita, palavra por palavra, o texto já aprovado
 *   e em produção em `(home)/page.tsx` (subtítulo da Home) e em
 *   `layout.tsx` (`metadata.description`) — nenhuma copy nova.
 *
 * Coluna "Institucional" (mencionada como exemplo na aprovação desta
 * rodada) foi DELIBERADAMENTE OMITIDA: não existe hoje nenhuma rota
 * institucional real no FastCompre (Sobre/Contato/Termos/Privacidade —
 * `apps/fastcompre/src/app` só tem Home/Categoria/Artigo). Criar essas
 * páginas está fora do escopo desta rodada ("não alterar o layout ... fora
 * do que for necessário para encaixar o novo footer") e um link para uma
 * rota inexistente seria funcionalidade inventada — nunca um placeholder
 * morto. Assinalado no relatório desta tarefa como limitação real, não
 * escondida; a coluna pode ser adicionada quando essas páginas existirem.
 *
 * Linha de copyright (`© {ano} FastCompre...`) é copy NOVA desta rodada
 * (texto legal padrão de mercado, não extraído de nenhum documento
 * aprovado anteriormente) — sinalizado explicitamente no relatório para o
 * PO poder ajustar a redação se quiser. `{new Date().getFullYear()}`: como
 * nenhuma rota pública deste app é estática (Home força dinâmico via
 * `connection()`; Categoria/Artigo não têm `generateStaticParams`, então
 * também renderizam por requisição — só o `fetch()` interno é que usa Data
 * Cache), o ano é recalculado a cada requisição real, nunca preso ao
 * instante de build.
 *
 * Estrutura: bloco de marca (wordmark + frase de apoio) e coluna
 * "Categorias" lado a lado a partir de `sm:` (640px) — MESMO breakpoint já
 * usado pela navegação persistente/drawer do Header (`category-nav.tsx`),
 * para a transição mobile→desktop do shell inteiro acontecer no mesmo
 * ponto, em vez de introduzir um segundo limiar. Abaixo de `sm:`,
 * empilhado (`flex-col`), conforme pedido ("mobile: versão empilhada,
 * preservando clareza e boa hierarquia"). Disclosure + copyright continuam
 * abaixo, separados por uma borda (`border-t border-outline-subtle`) — o
 * disclosure deixa de estar "solto visualmente desconectado" (motivação
 * explícita desta rodada) por passar a fazer parte da mesma composição do
 * footer, com marca/navegação acima dele na mesma superfície.
 *
 * `<nav aria-label="Categorias no rodapé">` — nome acessível DISTINTO do
 * `<nav aria-label="Categorias">` do Header (persistente e drawer, ver
 * `category-nav.tsx`): dois landmarks `<nav>` com o mesmo nome acessível
 * na mesma página são ambíguos para quem navega por landmarks em leitor de
 * tela (não há critério WCAG que proíba, mas é um problema de usabilidade
 * evitável, e não introduz nenhum token/decisão visual nova).
 *
 * `max-w-6xl` (1152px) preservado — mesma largura de container de
 * Header/Home/Categoria, decisão já fechada, não reaberta aqui.
 *
 * Refinamento visual (2ª rodada isolada, alinhamento final com
 * `testeLayout.png`) — fundo verde-floresta escuro:
 *
 * - `bg-inverse-surface` (`packages/ui/tokens/semantic-colors.css` →
 *   `--color-surface-inverse: var(--color-green-800)`, exposto ao
 *   Tailwind em `tailwind-theme.css`): reaproveita o MESMO primitivo já
 *   usado por `--color-accent-fill-active` (estado pressed de botão/CTA)
 *   — nenhum HEX/primitivo novo, só um segundo papel semântico ("superfície
 *   de seção escura", não "estado de interação") para o mesmo verde-floresta
 *   escuro já existente. Primeiro consumidor real da preparação
 *   "dark-mode-ready" que `semantic-colors.css` já documentava desde a
 *   UXF-001. `border-t border-outline-subtle` (borda clara contra fundo
 *   agora escuro, ficaria practicamente invisível/incoerente) foi removida
 *   do `<footer>` — a própria mudança de cor de fundo já demarca a seção,
 *   sem precisar de borda.
 * - Todo texto/link deste componente passa de `text-fg`/`text-fg-muted`
 *   para `text-fg-inverse` (→ `--color-text-inverse` → branco) — validado
 *   por `packages/ui/tokens/check-contrast.mjs` (par "texto claro (Footer)
 *   / superfície escura do Footer", 10.38:1, exigido >=4.5:1 — WCAG 2.2 AA
 *   texto normal, com folga). Hierarquia entre wordmark/tagline/heading
 *   "Categorias"/links/legal continua por TIPOGRAFIA (peso/tamanho/
 *   uppercase/tracking), não mais por variação de cor de texto — variar a
 *   cor abaixo de branco puro exigiria um segundo tom validado, fora do
 *   pedido "use apenas tokens existentes, não crie nova paleta".
 * - Hover de link (wordmark + itens de Categoria) passa de `hover:text-
 *   accent` para `hover:underline`: o token `accent`/`accent-hover`
 *   (verde-floresta médio, `#2C7D53`/`#1F633F`) NÃO cumpre 3:1 contra
 *   `bg-inverse-surface` (verde-floresta escuro, `#15492D`) — os dois tons
 *   de verde ficam próximos demais entre si (~2:1, abaixo do piso mesmo
 *   para elemento não-textual). Sublinhado no hover preserva a affordance
 *   de link sem depender de uma segunda cor.
 * - Foco: `focus-visible:ring-fg-inverse` (branco) em vez do `ring-focus`
 *   sitewide (verde-floresta médio, mesmo problema de contraste do hover
 *   acima) — único jeito de manter um anel de foco realmente visível
 *   sobre este fundo específico. Mesmo mecanismo (`focus-visible:outline-
 *   none focus-visible:ring-2`), só o token de cor muda, e só neste
 *   componente/fundo.
 * - Divisor interno (entre marca+Categorias e disclosure+copyright):
 *   `border-fg-inverse/15` — o mesmo token de texto claro, em opacidade
 *   reduzida, usado como borda puramente decorativa (sem exigência de
 *   contraste — mesmo critério já documentado para `border-subtle`/
 *   `border-default` em `check-contrast.mjs`); nenhum token de borda novo.
 */
export async function SiteFooter() {
  let categories: Awaited<ReturnType<typeof listPublicCategories>> = [];
  try {
    categories = await listPublicCategories();
  } catch {
    // Degradação graciosa (mesmo critério de `SiteHeader`, UXW-003): a
    // coluna "Categorias" é omitida nesta renderização; marca, disclosure
    // e copyright continuam funcionais.
    categories = [];
  }

  return (
    <footer className="bg-inverse-surface">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between sm:gap-12">
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="w-fit rounded-control font-ui font-action text-body text-fg-inverse hover:underline focus-visible:outline-none focus-visible:ring-2 ring-fg-inverse"
            >
              FastCompre
            </Link>
            <p className="max-w-sm font-ui text-body-sm text-fg-inverse">
              Comparativos e reviews de produtos para o público brasileiro.
            </p>
          </div>

          {categories.length > 0 && (
            <nav aria-label="Categorias no rodapé" className="flex flex-col gap-3">
              <h2 className="font-ui text-body-sm font-semibold uppercase tracking-wide text-fg-inverse">
                Categorias
              </h2>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/${category.slug}`}
                      className="rounded-control font-ui text-body-sm text-fg-inverse hover:underline focus-visible:outline-none focus-visible:ring-2 ring-fg-inverse"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-fg-inverse/15 pt-6">
          <p className="font-ui text-body-sm text-fg-inverse">
            Este site contém links de afiliados. Podemos ganhar uma comissão sobre compras qualificadas, sem custo adicional para você.
          </p>
          <p className="font-ui text-body-sm text-fg-inverse">
            © {new Date().getFullYear()} FastCompre. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
