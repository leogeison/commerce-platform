import Link from 'next/link';
import { listPublicCategories } from '@/lib/public-api/client';
import { CategoryNav } from './category-nav';

/**
 * apps/fastcompre/src/app/site-header.tsx
 *
 * UXW-001 — Header público do FastCompre: identidade visual e navegação
 * primária (UX-Implementation-Backlog.md, UXW-001).
 *
 * UXW-003 — menu global de Categorias. `SiteHeader` continua Server
 * Component — passa a ser `async` só para buscar as Categorias
 * (`listPublicCategories`, `lib/public-api/client.ts`) antes de renderizar;
 * nenhum estado, nenhum client fetch aqui. A indicação de item ativo (que
 * exige `usePathname()`) é isolada no Client Component mínimo `CategoryNav`
 * — `SiteHeader` só decide SE ele é renderizado, nunca QUAL item está
 * ativo. Footer (UXW-002) e o drawer mobile (UXW-004) continuam
 * responsabilidade de outras tarefas, não deste componente.
 *
 * Degradação graciosa (decisão fechada da UXW-003): falha ao buscar
 * Categorias (rede, HTTP, contrato) ou lista vazia — `<CategoryNav>` é
 * omitido inteiramente; o restante do Header (wordmark/link para "/")
 * continua funcional, sem propagar o erro para a página. `try/catch`
 * aqui, não em `listPublicCategories` — a função de fetch reporta o erro
 * fielmente; decidir degradar graciosamente é responsabilidade de quem a
 * consome.
 *
 * Wordmark "FastCompre" é texto simples, nunca `<h1>` — cada rota pública
 * já define seu próprio H1 (Architecture.md §33: um H1 por página; o
 * título do header não compete com ele). O símbolo de "check" do mockup de
 * direção visual ("FastCompre — Editorial Confiável") é explicitamente
 * placeholder de marca, não logotipo oficial
 * (docs/UXW-visual-direction-decision.md) — por isso não é reproduzido
 * aqui.
 *
 * `<nav>` de Categorias, quando existe, é o próprio `<CategoryNav>` — este
 * componente não introduz um segundo `<nav>` nem duplica o landmark.
 *
 * `flex flex-wrap`: único ajuste responsivo desta tarefa — reflow natural
 * (wordmark e itens de Categoria quebram linha conforme a largura
 * disponível), sem breakpoint, toggle, drawer ou `<dialog>`, que
 * pertencem à UXW-004 (não antecipada aqui).
 *
 * Usa só tokens/utilities já expostos por
 * `packages/ui/tokens/tailwind-theme.css` (`font-ui`, `font-action`,
 * `text-body`, `text-fg`, `text-accent`, `border-outline-subtle`,
 * `ring-focus`, `rounded-control`) — nenhum token novo introduzido, mesmo
 * critério já documentado naquele arquivo ("qualquer novo token exposto
 * aqui exige um consumidor real"). Largura de leitura (`max-w-3xl`) e
 * espaçamento (`px-4 py-4`) são Tailwind puro local, mesmo padrão já usado
 * nas 3 rotas públicas existentes (`page.tsx`) — não é um `Container` de
 * `packages/ui`: decisão explícita da UXW-001 de não promover enquanto não
 * existir um segundo consumidor real, e de manter qualquer largura/
 * container aqui local e reversível.
 */
export async function SiteHeader() {
  let categories: Awaited<ReturnType<typeof listPublicCategories>> = [];
  try {
    categories = await listPublicCategories();
  } catch {
    // Degradação graciosa (UXW-003): Header e página continuam
    // funcionais; o menu de Categorias é omitido nesta renderização.
    categories = [];
  }

  return (
    <header className="border-b border-outline-subtle">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
        <Link
          href="/"
          className="rounded-control font-ui font-action text-body text-fg hover:text-accent focus-visible:outline-none focus-visible:ring-2 ring-focus"
        >
          FastCompre
        </Link>
        {categories.length > 0 && <CategoryNav categories={categories} />}
      </div>
    </header>
  );
}
