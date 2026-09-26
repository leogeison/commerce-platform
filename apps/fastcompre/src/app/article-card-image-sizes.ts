/**
 * apps/fastcompre/src/app/article-card-image-sizes.ts
 *
 * UXW-013 — `sizes` do `next/image` da capa de Artigo nos cards de listagem
 * (Home e Categoria — dois consumidores reais simultâneos desta própria
 * tarefa, por isso extraído em vez de duplicado, mesmo critério já usado
 * para `pagination.tsx`/`pagination-window.ts`). Derivado da largura REAL
 * do layout existente, não de um valor presumido:
 *
 * - `(home)/page.tsx`/`[categorySlug]/page.tsx`: `<main className="mx-auto
 *   max-w-3xl px-4 ...">` — `max-w-3xl` (Tailwind, não sobrescrito em
 *   `packages/ui/tokens/tailwind-theme.css`) é `48rem` = `768px`; `px-4` é
 *   `1rem` = `16px` de cada lado, PADDING interno ao `<main>` (não externo
 *   a ele). A imagem (`<img className="... w-full ...">`, dentro de
 *   `<article>`/`<a>`/`<li>` — nenhum desses adiciona padding/max-width
 *   próprio) ocupa 100% da área de conteúdo do `<main>`.
 * - Área de conteúdo = `min(768px, larguraDaViewport) - 32px` (os dois
 *   `px-4`). Para `larguraDaViewport >= 768px`, a área de conteúdo é fixa
 *   em `768 - 32 = 736px`. Abaixo de `768px`, a área de conteúdo acompanha
 *   a viewport: `larguraDaViewport - 32px`.
 * - Por isso `sizes` tem exatamente um breakpoint, no mesmo valor em que
 *   `max-w-3xl` deixa de limitar o `<main>` (`768px`): abaixo disso, a
 *   imagem ainda ocupa a viewport inteira menos o padding; a partir dali,
 *   fica travada em `736px` — nunca um valor "chutado" por suposição.
 */
export const ARTICLE_CARD_IMAGE_SIZES = '(min-width: 768px) 736px, calc(100vw - 32px)';
