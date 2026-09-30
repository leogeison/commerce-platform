/**
 * apps/fastcompre/src/app/article-card-image-sizes.ts
 *
 * UXW-013 — `sizes` do `next/image` da capa de Artigo nos CARDS de grade
 * (Home — artigos além do hero — e Categoria — dois consumidores reais
 * simultâneos, por isso extraído em vez de duplicado, mesmo critério já
 * usado para `pagination.tsx`/`pagination-window.ts`).
 *
 * RECALIBRADO no refinamento visual pós-`testeLayout.png` (decisão final
 * do PO, correção final de composição): a listagem passou a ser um grid
 * (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), e o container em si
 * também ficou mais largo (`max-w-3xl` → `max-w-6xl`, ver `(home)/page.tsx`
 * e `[categorySlug]/page.tsx`). Continua derivado da largura REAL do grid,
 * nunca de um valor presumido:
 *
 * - Container: `<main className="mx-auto max-w-6xl px-4 ...">`. `max-w-6xl`
 *   = 1152px; `px-4` = 32px de padding total → área de conteúdo de até
 *   1120px a partir de 1152px de viewport; abaixo disso, acompanha a
 *   viewport (`calc(100vw - 32px)`) — mesma derivação de sempre para a
 *   faixa de 1 coluna.
 * - Grid: `gap-10` (2.5rem = 40px) entre colunas em `md:`/`lg:` — mesmo
 *   valor já usado antes desta tarefa (nenhum token novo). Em mobile
 *   (`grid-cols-1`) o gap vertical entre cards passou a ser `gap-6`
 *   (refinamento de espaçamento mobile, ver `(home)/page.tsx`), mas isso
 *   não afeta este cálculo: com 1 coluna só, o gap nunca divide a largura
 *   do card, só o espaço vertical entre eles.
 *
 * IMPORTANTE — diferente do container anterior (`max-w-3xl`, cujo teto
 * coincidia exatamente com o breakpoint `md:` de 768px, então a largura do
 * card já ficava travada assim que o grid de 2 colunas começava), o novo
 * teto do container (`max-w-6xl`, 1152px) fica ACIMA dos breakpoints
 * `md:`/`lg:` (768px/1024px) que ativam 2 e 3 colunas — ou seja, dentro de
 * cada uma dessas faixas o container ainda está fluido, crescendo com a
 * viewport, e só trava no valor final ao atingir 1152px. Em vez de uma
 * fórmula em `vw` por faixa (mais fiel, mas sem precedente neste arquivo),
 * cada faixa usa o valor de coluna MAIS LARGO que ela pode assumir — o
 * mesmo critério "nunca descrever uma área menor que a real, arredondar
 * para cima" já usado aqui, aplicado ao limite superior de cada faixa em
 * vez de só ao arredondamento de fração de pixel:
 *
 * - `md:grid-cols-2` (768px–1024px, antes do grid virar 3 colunas): a
 *   largura de coluna mais larga possível nesta faixa ocorre no limite
 *   superior (1024px de viewport, ainda fluido, não travado): conteúdo =
 *   1024 − 32 = 992px; 1 gap de 40px entre as 2 colunas → coluna = (992 −
 *   40) / 2 = 476px exatos. Usar este valor fixo para toda a faixa
 *   `md:`–`lg:` superestima a largura real perto de 768px (onde a coluna
 *   real é só 348px) — never um problema, só faz o navegador reservar
 *   banda um pouco maior que o estritamente necessário; nunca descreve uma
 *   área menor que a real.
 * - `lg:grid-cols-3` (a partir de 1024px, incluindo a faixa fluida até
 *   1152px e depois o teto travado): a largura de coluna mais larga
 *   possível ocorre no teto do container (viewport ≥ 1152px, conteúdo
 *   travado em 1120px): 2 gaps de 40px entre as 3 colunas → coluna = (1120
 *   − 80) / 3 = 346,67px; arredondado para 347px — para cima, nunca para
 *   baixo. Mesmo raciocínio de superestimativa segura entre 1024px e
 *   1152px (onde a coluna real varia de 304px a 346,67px).
 *
 * O hero da Home (fora do grid) NÃO usa esta constante: usa
 * `HOME_HERO_IMAGE_SIZES`, local a `(home)/page.tsx` — mesmo critério já
 * aplicado a `ARTICLE_HERO_IMAGE_SIZES` em `[articleSlug]/page.tsx` —
 * porque esta constante descreve uma COLUNA de grid, não o container
 * inteiro nem a coluna de imagem do hero (que agora é ~60% do container a
 * partir de `md:`, não uma fração de grid).
 */
export const ARTICLE_CARD_IMAGE_SIZES =
  '(min-width: 1024px) 347px, (min-width: 768px) 476px, calc(100vw - 32px)';
