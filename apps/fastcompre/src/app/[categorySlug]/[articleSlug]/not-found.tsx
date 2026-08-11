/**
 * Boundary de `notFound()` (WEB-010) para o segmento de rota do Artigo —
 * captura só o `notFound()` já lançado por `page.tsx` (WEB-004) quando o
 * artigo não existe; não altera esse `notFound()` nem afeta o fallback
 * genérico da Categoria (fora do escopo desta tarefa).
 *
 * Componente puro, sem `fetch`/props — o Next.js já responde com status
 * `404` HTTP automaticamente ao renderizar esta boundary, sem lógica manual
 * aqui. Mesma estrutura visual mínima das outras páginas públicas
 * (`mx-auto max-w-3xl px-4 py-12`, um `<h1>` por página).
 */
export default function ArticleNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Artigo não encontrado</h1>
      <p className="mt-2 text-neutral-500">
        O artigo que você está procurando não existe ou não está mais disponível.
      </p>
      <a href="/" className="mt-6 inline-block text-sm underline">
        Voltar para a Home
      </a>
    </main>
  );
}
