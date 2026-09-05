import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ElementType, ReactElement } from 'react';
import { ArticlePreview } from './article-preview';
import type { CompiledArticleBody } from './compile-article-body';

/**
 * apps/admin/src/app/[siteSlug]/articles/article-preview.spec.tsx
 *
 * UXE-009 — Preview do Artigo.
 *
 * `jest.mock('./compile-article-body', ...)` é ESTÁTICO — nunca
 * `jest.doMock` nem `jest.resetModules`. `ArticlePreview` é importado
 * estaticamente, uma única vez, exatamente como qualquer outro componente
 * testado neste diretório; `react`/`react-dom` também são carregados uma
 * única vez, sem nenhum risco de instância duplicada.
 *
 * A referência para configurar o mock (`compileArticleBody`) é obtida via
 * `jest.requireMock()`, não por `import { compileArticleBody } from
 * './compile-article-body'` — ver comentário junto a essa linha, mais
 * abaixo, para a causa raiz exata de por que o import estático não
 * funciona aqui.
 *
 * Por que mockar `compileArticleBody` em vez de deixar rodar de verdade:
 * `@mdx-js/mdx` é ESM puro, e `apps/admin/next.config.ts` não declara
 * `transpilePackages` para ele — decisão que permanece em aberto, fora do
 * escopo deste ajuste test-only (não altera `next.config.ts`). Em vez de
 * depender do Jest conseguir carregar essa árvore ESM real, este arquivo
 * testa só o CONTRATO de UI de `ArticlePreview`: que ele chama
 * `compileArticleBody(bodyMdx)`, trata os estados loading/sucesso/
 * desatualizado corretamente, e passa `components={{ h1: 'h2' }}` adiante
 * para o que quer que seja retornado. Os componentes "compilados" abaixo
 * são fakes controlados pelo teste, não uma simulação do parser MDX real.
 *
 * O cenário do bloco `:::product` (mais abaixo) usa a mesma técnica: o
 * fake retorna o texto literal que o pipeline real já produz para esse
 * bloco sob `format: 'md'` — comportamento comprovado empiricamente em
 * `docs/editorial/editorial-serialization-contract.md` (§7, spikes
 * `product-block-round-trip-full-cycle.mjs`) e por `compile-article-body.spec.ts`
 * (que mocka `@mdx-js/mdx` para testar só os argumentos passados a
 * `evaluate`) — nenhum dos dois é substituído por este teste. Este arquivo
 * NÃO valida o parsing real de `:::product`; valida só que, dado um
 * resultado de compilação nesse formato, `ArticlePreview` o exibe sem
 * quebrar. A validação do compilador real permanece onde já estava,
 * separada da cobertura de UI.
 */
jest.mock('./compile-article-body', () => ({
  compileArticleBody: jest.fn(),
}));

// `compileArticleBody` NÃO é obtido por `import { compileArticleBody } from
// './compile-article-body'` estático — causa raiz confirmada do bug
// reportado (`.mockResolvedValueOnce`/`.mockImplementationOnce` ausentes em
// runtime): imports ES são sempre resolvidos antes de qualquer outro
// código de nível de módulo (regra da própria linguagem, não algo que
// reordenar declarações no arquivo-fonte resolveria) — um `import` estático
// do MESMO especificador mockado por `jest.mock()`, neste projeto/setup de
// SWC do `next/jest`, capturou a função REAL antes da substituição do
// módulo surtir efeito, então a referência local nunca foi o `jest.fn()`
// do factory acima. `article-preview-error.spec.tsx` nunca sofria disso
// porque nunca importa `compileArticleBody` diretamente — só consome o
// mock indiretamente, em tempo de execução do teste, via `import()`
// dinâmico já existente dentro de `ArticlePreview` (código de produção,
// inalterado).
//
// `jest.requireMock()` busca a versão já mockada do módulo por uma chamada
// de função comum, executada em sequência normal (não uma declaração de
// import) — não sofre da regra de precedência de imports ES, não usa
// `jest.doMock`/`jest.resetModules`/import dinâmico.
const { compileArticleBody } = jest.requireMock<typeof import('./compile-article-body')>('./compile-article-body');
const compileArticleBodyMock = jest.mocked(compileArticleBody);

function fakeCompiled(
  renderContent: (props: { components?: Record<string, unknown> }) => ReactElement,
): CompiledArticleBody {
  return renderContent as unknown as CompiledArticleBody;
}

afterEach(() => {
  jest.resetAllMocks();
});

describe('ArticlePreview', () => {
  it('abre o preview e mostra o conteúdo resolvido por compileArticleBody', async () => {
    compileArticleBodyMock.mockResolvedValueOnce(fakeCompiled(() => <p>Parágrafo de teste.</p>));

    render(<ArticlePreview bodyMdx={'Parágrafo de teste.'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));

    await waitFor(() => {
      expect(screen.getByText('Parágrafo de teste.')).toBeInTheDocument();
    });
    expect(compileArticleBodyMock).toHaveBeenCalledWith('Parágrafo de teste.');
  });

  it('mostra o estado de carregamento enquanto compileArticleBody está em voo, e some quando resolve', async () => {
    let resolveCompile: (content: CompiledArticleBody) => void = () => {};
    compileArticleBodyMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCompile = resolve;
        }),
    );

    render(<ArticlePreview bodyMdx={'Parágrafo de teste.'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));

    await waitFor(() => {
      expect(screen.getByText('Gerando preview...')).toBeInTheDocument();
    });

    resolveCompile(fakeCompiled(() => <p>Parágrafo de teste.</p>));

    await waitFor(() => {
      expect(screen.getByText('Parágrafo de teste.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Gerando preview...')).not.toBeInTheDocument();
  });

  it('fecha o preview ao clicar em "Fechar preview" e devolve o foco ao botão', async () => {
    compileArticleBodyMock.mockResolvedValueOnce(fakeCompiled(() => <p>Parágrafo de teste.</p>));

    render(<ArticlePreview bodyMdx={'Parágrafo de teste.'} />);
    const toggleButton = screen.getByRole('button', { name: 'Ver preview' });
    await userEvent.click(toggleButton);
    await waitFor(() => {
      expect(screen.getByText('Parágrafo de teste.')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Fechar preview' }));

    expect(screen.queryByText('Parágrafo de teste.')).not.toBeInTheDocument();
    expect(toggleButton).toHaveFocus();
  });

  it('passa components={{ h1: "h2" }} adiante — heading nível 1 do conteúdo compilado sai como heading nível 2', async () => {
    compileArticleBodyMock.mockResolvedValueOnce(
      fakeCompiled(({ components }) => {
        const Heading = (components?.h1 as ElementType) ?? 'h1';
        return <Heading>Seção do artigo</Heading>;
      }),
    );

    render(<ArticlePreview bodyMdx={'# Seção do artigo'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Seção do artigo' })).toBeInTheDocument();
    });
    // Nenhum h1 deve existir no preview — nem o do próprio painel (usa h2
    // para o rótulo "Preview"), nem o do conteúdo compilado (remapeado).
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('exibe o bloco :::product como texto literal seguro, sem quebrar — mesmo resultado já validado do pipeline real', async () => {
    // Fixture: o texto que `evaluate(bodyMdx, { format: 'md' })` REAL já
    // produz para este bloco (nenhum plugin de diretiva presente sob
    // `format: 'md'`) — evidência em
    // `docs/editorial/editorial-serialization-contract.md` §7. Este teste
    // não invoca o compilador real; só confirma que `ArticlePreview` exibe
    // fielmente o que compileArticleBody devolver, sem cair em erro.
    compileArticleBodyMock.mockResolvedValueOnce(
      fakeCompiled(() => (
        <>
          <p>Texto antes do bloco.</p>
          <p>{':::product\nversion: 1\nproductId: 123e4567-e89b-12d3-a456-426614174000\n:::'}</p>
          <p>Texto depois do bloco.</p>
        </>
      )),
    );

    const { container } = render(<ArticlePreview bodyMdx={'(irrelevante para este teste, ver mock acima)'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));

    await waitFor(() => {
      expect(screen.getByText('Texto antes do bloco.')).toBeInTheDocument();
    });

    expect(container.textContent).toContain(':::product');
    expect(container.textContent).toContain('productId: 123e4567-e89b-12d3-a456-426614174000');
    expect(screen.getByText('Texto depois do bloco.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marca o preview como desatualizado quando bodyMdx muda com o painel aberto, e "Atualizar preview" recompila', async () => {
    compileArticleBodyMock
      .mockResolvedValueOnce(fakeCompiled(() => <p>Conteúdo original.</p>))
      .mockResolvedValueOnce(fakeCompiled(() => <p>Conteúdo novo.</p>));

    const { rerender } = render(<ArticlePreview bodyMdx={'Conteúdo original.'} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));
    await waitFor(() => {
      expect(screen.getByText('Conteúdo original.')).toBeInTheDocument();
    });

    rerender(<ArticlePreview bodyMdx={'Conteúdo novo.'} />);

    expect(
      screen.getByText('O conteúdo foi alterado desde a última geração deste preview.', { exact: false }),
    ).toBeInTheDocument();
    // Sem recompilação automática: o conteúdo antigo continua visível até a
    // ação explícita.
    expect(screen.getByText('Conteúdo original.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Atualizar preview' }));

    await waitFor(() => {
      expect(screen.getByText('Conteúdo novo.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Conteúdo original.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('O conteúdo foi alterado desde a última geração deste preview.', { exact: false }),
    ).not.toBeInTheDocument();
    expect(compileArticleBodyMock).toHaveBeenCalledTimes(2);
  });
});
