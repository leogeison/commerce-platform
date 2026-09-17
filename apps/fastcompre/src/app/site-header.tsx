import Link from 'next/link';

/**
 * apps/fastcompre/src/app/site-header.tsx
 *
 * UXW-001 — Header público do FastCompre: identidade visual e navegação
 * primária (UX-Implementation-Backlog.md, UXW-001).
 *
 * Server Component puro — sem `"use client"`, estado, fetch ou qualquer
 * JavaScript client-side: nada aqui precisa de interatividade. Categorias
 * (UXW-003), Footer (UXW-002) e o drawer mobile (UXW-004) são
 * responsabilidade de tarefas futuras, não deste componente.
 *
 * Wordmark "FastCompre" é texto simples, nunca `<h1>` — cada rota pública
 * já define seu próprio H1 (Architecture.md §33: um H1 por página; o
 * título do header não compete com ele). O símbolo de "check" do mockup de
 * direção visual ("FastCompre — Editorial Confiável") é explicitamente
 * placeholder de marca, não logotipo oficial
 * (claude/UXW-visual-direction-decision.md) — por isso não é reproduzido
 * aqui.
 *
 * Sem `<nav>`: Categorias (UXW-003) é o primeiro consumidor real desse
 * elemento. Um `<nav>` vazio não comunica nenhum landmark útil a
 * tecnologia assistiva — criar um agora seria antecipar estrutura de uma
 * tarefa futura, exatamente o que a UXW-001 pede para evitar.
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
export function SiteHeader() {
  return (
    <header className="border-b border-outline-subtle">
      <div className="mx-auto flex max-w-3xl items-center px-4 py-4">
        <Link
          href="/"
          className="rounded-control font-ui font-action text-body text-fg hover:text-accent focus-visible:outline-none focus-visible:ring-2 ring-focus"
        >
          FastCompre
        </Link>
      </div>
    </header>
  );
}
