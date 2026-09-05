'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import { type CompiledArticleBody } from './compile-article-body';
import styles from './article-form.module.css';

/**
 * apps/admin/src/app/[siteSlug]/articles/article-preview.tsx
 *
 * UXE-009 — Preview do Artigo.
 *
 * Decisões fechadas no desenho aprovado desta tarefa:
 * - Preview sob demanda, não live-preview: compila só quando o painel é
 *   aberto ou quando "Atualizar preview" é acionado — nunca a cada tecla
 *   digitada em `bodyMdx`.
 * - Se `bodyMdx` mudar enquanto o painel está aberto, o preview não
 *   recompila sozinho — fica marcado como desatualizado (comparação simples
 *   contra o `bodyMdx` do último compile bem-sucedido) com uma ação
 *   explícita "Atualizar preview".
 * - Sem Error Boundary: não há evidência concreta, dentro do subconjunto de
 *   Markdown aceito (mais o bloco `:::product` já existente, que sob
 *   `format: 'md'` renderiza como texto literal seguro — não há plugin de
 *   diretiva carregado), de que o componente compilado lance só durante o
 *   render, distinto de uma rejeição na própria compilação. Só a rejeição
 *   da Promise de `compileArticleBody` é tratada.
 * - `components={{ h1: 'h2' }}` replica exatamente o remap já usado em
 *   produção por `apps/fastcompre/.../page.tsx` — mesmo racional (o H1 real
 *   da página pública é o título do Artigo, fora do corpo compilado).
 * - Fidelidade é estrutural/de conteúdo (mesmo compilador, mesma estrutura
 *   de heading), não visual/tipográfica — nenhum CSS da FastCompre é
 *   importado aqui, decisão explícita para não antecipar UXW-009.
 *
 * `ArticleForm` continua dono de `bodyMdx` — este componente só recebe o
 * valor atual como prop, nunca o modifica.
 */

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; Content: CompiledArticleBody }
  | { status: 'error' };

const GENERIC_PREVIEW_ERROR_MESSAGE = 'Não foi possível gerar o preview deste conteúdo.';

interface ArticlePreviewProps {
  bodyMdx: string;
}

export function ArticlePreview({ bodyMdx }: ArticlePreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const [compiledFromBodyMdx, setCompiledFromBodyMdx] = useState<string | null>(null);
  const headingId = useId();
  const panelId = useId();
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Descarta o resultado de um compile() que ainda está em voo quando outro
  // é disparado por cima (reabrir o painel rapidamente após fechar, ou
  // "Atualizar preview" acionado antes do compile anterior terminar) — só o
  // resultado do compile mais recente pode atualizar o estado.
  const latestRequestIdRef = useRef(0);

  const isStale =
    isOpen && compiledFromBodyMdx !== null && bodyMdx !== compiledFromBodyMdx && state.status !== 'loading';

  useEffect(() => {
    if (isOpen) {
      headingRef.current?.focus();
    }
  }, [isOpen]);

  async function compile(sourceBodyMdx: string) {
    const requestId = ++latestRequestIdRef.current;
    setState({ status: 'loading' });

    try {
      const { compileArticleBody } = await import('./compile-article-body');
      const Content = await compileArticleBody(sourceBodyMdx);

      if (latestRequestIdRef.current !== requestId) {
        return;
      }
      setState({ status: 'ready', Content });
      setCompiledFromBodyMdx(sourceBodyMdx);
    } catch {
      if (latestRequestIdRef.current !== requestId) {
        return;
      }
      setState({ status: 'error' });
    }
  }

  function handleToggle() {
    if (isOpen) {
      setIsOpen(false);
      toggleButtonRef.current?.focus();
      return;
    }

    setIsOpen(true);
    void compile(bodyMdx);
  }

  return (
    <div className={styles.previewContainer}>
      <button ref={toggleButtonRef} type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={handleToggle}>
        {isOpen ? 'Fechar preview' : 'Ver preview'}
      </button>

      {isOpen && (
        <section id={panelId} aria-labelledby={headingId} className={styles.previewPanel}>
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.previewHeading}>
            Preview
          </h2>

          {isStale && (
            <p role="status" className={styles.previewStale}>
              O conteúdo foi alterado desde a última geração deste preview.{' '}
              <button type="button" onClick={() => void compile(bodyMdx)}>
                Atualizar preview
              </button>
            </p>
          )}

          {state.status === 'loading' && (
            <p role="status" className={styles.previewLoading}>
              <Loader2 aria-hidden="true" className={styles.previewLoadingIcon} />
              Gerando preview...
            </p>
          )}

          {state.status === 'error' && (
            <p role="alert" className={styles.previewError}>
              <CircleAlert aria-hidden="true" className={styles.previewErrorIcon} />
              {GENERIC_PREVIEW_ERROR_MESSAGE}
            </p>
          )}

          {state.status === 'ready' && (
            <div className={styles.previewContent}>
              <state.Content components={{ h1: 'h2' }} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
