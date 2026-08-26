'use client';

import { Text } from '@commerce-platform/ui';

interface AuthorAvatarProps {
  name: string;
  avatarUrl: string | null;
  className?: string;
}

/**
 * UXA-015 — preview/visão de avatar de Autor, com fallback visual quando
 * `avatarUrl` é `null` (decisão aprovada nesta tarefa, consistente com o
 * fallback que a byline pública vai reaproveitar depois, UXW-010 — mas
 * UXA-015 vem ANTES de UXW-010 na cadeia de dependências: essa decisão
 * nasce aqui, não é copiada de nenhum código público existente).
 *
 * Local a `authors/` — dois consumidores reais desde o primeiro dia
 * (`AuthorForm`, `AuthorReadOnly`), mesmo critério que já promoveu
 * `async-state.tsx` para `[siteSlug]/` (segundo consumidor real dentro do
 * Admin), mas sem justificativa para `packages/ui`: nenhum consumidor real
 * em `apps/fastcompre` existe hoje.
 *
 * `computeInitials` é deliberadamente uma função interna, não exportada —
 * suas regras são cobertas via o comportamento renderizado do próprio
 * componente (`author-avatar.spec.tsx`), nunca chamada diretamente pelo
 * teste. Evita uma exportação não-componente neste módulo só por
 * testabilidade (e o warning `react-refresh/only-export-components` que
 * isso geraria).
 *
 * Regras das iniciais (aprovadas): primeira letra da primeira palavra +
 * primeira letra da última palavra, maiúsculas; nome de uma única palavra
 * usa só sua primeira letra; espaços extras (`"  Ana   Silva  "`) são
 * ignorados via `trim()` + `split(/\s+/)` + `filter(Boolean)`; nome vazio
 * (só ocorre transitoriamente na criação, antes do campo obrigatório ser
 * preenchido) produz iniciais `''` — o container do fallback continua
 * montado (mesmo footprint reservado), só sem texto dentro.
 *
 * `aria-hidden="true"` no fallback: nos dois consumidores reais de hoje, o
 * nome do Autor já está visível e associado ao lado (o campo "Nome" no
 * formulário, o `<h1>` no modo leitura) — expor as iniciais para
 * tecnologia assistiva anunciaria o mesmo nome duas vezes. Nunca uma
 * imagem artificial: o fallback é texto estilizado (`<div>`), nunca um
 * `<img>` gerado.
 *
 * Quando `avatarUrl` está presente, a imagem real usa `alt={name}` — nome
 * completo do Autor, critério de aceite explícito desta tarefa para o
 * Admin (diferente da regra pública futura de UXW-010, que é outro
 * critério, de outra tarefa, não antecipado aqui).
 *
 * Geometria: `BOX_CLASSES` é compartilhada, caractere por caractere, entre
 * a imagem real e o fallback — `w-40` (160px, mesmo tamanho já usado nos
 * CSS Modules originais de Autor) com `max-w-full` (nunca ultrapassa o
 * container em viewports estreitos, ex. 320px) e `aspect-square` (a altura
 * sempre acompanha a largura renderizada, mesmo quando `max-w-full`
 * encolhe) — os dois estados (imagem/fallback) sempre ocupam exatamente o
 * mesmo espaço, então alternar entre eles (selecionar/remover arquivo)
 * nunca desloca o restante do formulário. `object-cover` na imagem evita
 * distorção (preenche a caixa recortando, em vez de espremer). `shrink-0`
 * impede que o avatar seja espremido pelo flex pai; `overflow-hidden`
 * garante que a imagem recortada respeite os cantos arredondados da caixa.
 */
const BOX_CLASSES = 'w-40 max-w-full aspect-square shrink-0 overflow-hidden rounded-control border border-outline';

function computeInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  if (words.length === 1) {
    return words[0]![0]!.toUpperCase();
  }
  return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase();
}

export function AuthorAvatar({ name, avatarUrl, className }: AuthorAvatarProps) {
  const boxClassName = `${BOX_CLASSES} ${className ?? ''}`.trim();

  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${boxClassName} object-cover`} />;
  }

  return (
    <div aria-hidden="true" className={`${boxClassName} flex items-center justify-center bg-surface`}>
      <Text as="span" tone="muted" className="m-0 font-action">
        {computeInitials(name)}
      </Text>
    </div>
  );
}
