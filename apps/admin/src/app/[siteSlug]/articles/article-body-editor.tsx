'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  BOLD_STAR,
  HEADING,
  ITALIC_STAR,
  LINK,
  ORDERED_LIST,
  QUOTE,
  UNORDERED_LIST,
} from '@lexical/markdown';
import type { EditorState } from 'lexical';
import { PRODUCT_BLOCK } from './product-block/transformer';
import { ProductBlockNode } from './product-block/node';
import styles from './article-form.module.css';

/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-editor.tsx
 *
 * UXE-006 — Integração base do Lexical no Admin.
 *
 * Substitui o `<textarea id="article-body">` de `ArticleForm` (decisão
 * fechada na ADM-009) pelo editor Lexical básico aprovado no desenho desta
 * tarefa. `ArticleForm` continua dono do estado (`useState<string>`) —
 * este componente é "burro": recebe `initialValue` (só lido na montagem,
 * nunca reimportado a cada re-render do pai) e chama `onChange(markdown)`
 * a cada edição real do usuário, nunca na montagem/import inicial.
 *
 * Escopo: transformers Markdown padrão do editor base (heading, citação,
 * lista ordenada/não ordenada, link, negrito, itálico) + o transformer
 * customizado `PRODUCT_BLOCK` (`:::product`, UXE-003/UXE-004), exigido
 * explicitamente pela UXE-006 e pelo Editorial Serialization Contract §8.
 * Sem `CODE`/`INLINE_CODE` — nenhum dos 3 `bodyMdx` reais persistidos
 * (`spikes/lexical-editorial/corpus/persisted-current/`) contém código
 * inline ou bloco cercado.
 *
 * Fora de escopo (não implementado aqui): toolbar visual, menu `/`
 * (UXE-007), autosave (UXE-008), seletor/inserção/edição funcional de
 * bloco Produto e resolução de Produto/Oferta (UXE-011). Nenhuma
 * infraestrutura de criação de formatação foi construída além do que o
 * próprio `RichTextPlugin`/`ListPlugin`/`LinkPlugin`/`HistoryPlugin`
 * oferecem nativamente.
 */

const TRANSFORMERS = [HEADING, QUOTE, UNORDERED_LIST, ORDERED_LIST, LINK, BOLD_STAR, ITALIC_STAR, PRODUCT_BLOCK];

/**
 * Funções em escopo de módulo (não recriadas a cada renderização) usadas
 * por `useSyncExternalStore` na guarda client-only/SSR-safe de
 * `ArticleBodyEditor` (ver comentário completo no próprio componente).
 * Não existe nenhuma "loja" externa real por trás disso — apenas o par
 * de snapshots servidor/cliente que `useSyncExternalStore` já resolve
 * corretamente durante a hidratação — por isso `subscribeNever` nunca
 * notifica nenhum listener.
 */
function subscribeNever(): () => void {
  return () => {};
}

function getClientMountedSnapshot(): boolean {
  return true;
}

function getServerMountedSnapshot(): boolean {
  return false;
}

interface ArticleBodyEditorProps {
  id: string;
  labelId: string;
  initialValue: string;
  onChange: (markdown: string) => void;
  disabled?: boolean;
}

/**
 * Mantém `editor.setEditable()` sincronizado com a prop `disabled` (mesmo
 * papel de `disabled={isSubmitting}` já usado nos demais campos de
 * `ArticleForm`) — `initialConfig.editable` só vale na criação do editor,
 * não reage a mudanças posteriores.
 */
function EditableSyncPlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return null;
}

/**
 * Serializa para Markdown e propaga via `onChange` — mas só quando o
 * conteúdo exportado realmente diverge do valor inicial importado
 * (`baselineMarkdownRef`), nunca por descartar uma notificação específica
 * pela sua posição ordinal (`OnChangePlugin` pode disparar zero, uma ou
 * mais notificações "espúrias" — sem mudança de conteúdo — durante a
 * montagem/import inicial e o commit da raiz DOM; a quantidade exata não é
 * uma garantia documentada da versão instalada de `@lexical/react`, então
 * o código não pode depender dela).
 *
 * `baselineMarkdownRef` é calculado uma única vez, de forma síncrona,
 * dentro da própria função `editorState` de `LexicalComposer` (ver abaixo)
 * — ou seja, na mesma atualização que importa `initialValue`, antes de
 * `ChangeTrackerPlugin` sequer montar e registrar seu listener. Isso
 * garante que o baseline já existe antes de qualquer notificação possível
 * do `OnChangePlugin`, sem depender de quantas notificações ocorrem nem em
 * que ordem.
 *
 * Enquanto o Markdown exportado for igual ao baseline, nenhuma notificação
 * é uma edição real — `onChange` não é chamado (cobre montagem/import e
 * qualquer commit inicial da raiz DOM, sejam quantos forem). Assim que o
 * Markdown exportado divergir do baseline pela primeira vez, essa
 * notificação É a primeira edição real do usuário: `onChange` é chamado
 * com o Markdown atualizado e `hasDivergedFromBaselineRef` passa a `true`
 * — a partir daí, toda notificação seguinte chama `onChange` normalmente
 * (sem voltar a comparar com o baseline), incluindo o caso de o usuário
 * desfazer a edição e retornar ao conteúdo original.
 */
function ChangeTrackerPlugin({
  onChange,
  baselineMarkdownRef,
}: {
  onChange: (markdown: string) => void;
  baselineMarkdownRef: React.RefObject<string>;
}) {
  const hasDivergedFromBaselineRef = useRef(false);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const exportedMarkdown = $convertToMarkdownString(TRANSFORMERS);

        if (!hasDivergedFromBaselineRef.current) {
          if (exportedMarkdown === baselineMarkdownRef.current) {
            // Notificação sem mudança de conteúdo em relação ao valor
            // inicial importado (montagem, import, commit de raiz DOM,
            // seleção sem edição, etc.) — não é uma edição real.
            return;
          }
          hasDivergedFromBaselineRef.current = true;
        }

        onChange(exportedMarkdown);
      });
    },
    [onChange, baselineMarkdownRef],
  );

  return <OnChangePlugin onChange={handleChange} />;
}

export function ArticleBodyEditor({ id, labelId, initialValue, onChange, disabled = false }: ArticleBodyEditorProps) {
  // Guarda client-only/SSR-safe: o Next.js ainda faz uma passada de
  // renderização no servidor para Client Components — `LexicalComposer`/
  // `ContentEditable` só montam depois da hidratação, evitando qualquer
  // acesso a `document`/`window` antes disso (mesmo risco de
  // SSR/hidratação já registrado no backlog para esta tarefa).
  //
  // `useSyncExternalStore` (em vez de `useState` + `useEffect(() =>
  // setState(...), [])`) evita `setState` síncrono dentro de um effect
  // (proibido por `react-hooks/set-state-in-effect`): não existe nenhuma
  // "loja" externa real para assinar aqui — `subscribeNever` nunca
  // notifica —, então o valor só muda entre o snapshot do servidor
  // (`getServerMountedSnapshot`, sempre `false`) e o snapshot do cliente
  // (`getClientMountedSnapshot`, sempre `true`); é o próprio React quem
  // reconcilia essa troca após a hidratação, sem nenhum `setState`
  // manual. Mesma semântica anterior: primeira renderização (servidor e
  // primeira passada do cliente) é `false`; a partir da hidratação, `true`.
  const isMounted = useSyncExternalStore(subscribeNever, getClientMountedSnapshot, getServerMountedSnapshot);

  // Preenchido de forma síncrona dentro de `initialConfig.editorState`
  // (abaixo), antes de qualquer plugin montar — ver o racional completo no
  // comentário de `ChangeTrackerPlugin`. `useRef` (não `useState`): este
  // valor nunca deve causar re-render, é lido apenas por dentro de um
  // callback do Lexical.
  const baselineMarkdownRef = useRef<string>('');

  // `initialConfig` só é lido por `LexicalComposer` na criação do editor
  // (mudanças posteriores no objeto são ignoradas — mesma premissa já
  // documentada para `editable`/`EditableSyncPlugin` acima). Inicialização
  // preguiçosa de estado via `useState(() => ...)` (não `useRef` — acessar/
  // atribuir `ref.current` durante a própria renderização é proibido por
  // `react-hooks/refs` no React 19; não `useMemo` — um array de
  // dependências vazio ficaria, por definição, "desatualizado" em relação
  // a `disabled`/`initialValue`, que são lidos só aqui e nunca mais,
  // gerando o warning `useMemo has missing dependencies`). Nenhum setter é
  // usado (nem effect): o estado existe só para manter esse snapshot
  // estável durante toda a vida desta instância do editor — a função
  // passada a `useState` roda uma única vez, na primeira renderização, e
  // seu resultado nunca é recalculado nem descartado por reconciliação
  // (diferente de `useMemo`, que é só uma otimização, não uma garantia).
  const [initialConfig] = useState<InitialConfigType>(() => ({
    namespace: 'article-body-editor',
    editable: !disabled,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, ProductBlockNode],
    onError: (error) => {
      throw error;
    },
    // Import inicial do `bodyMdx` existente — roda uma única vez, na
    // criação do editor, dentro de um `editor.update()` interno do
    // Lexical. Na mesma passada, calcula e grava o baseline usado por
    // `ChangeTrackerPlugin` para distinguir "import" de "edição real" —
    // ver o racional completo no comentário de `ChangeTrackerPlugin`.
    editorState: () => {
      $convertFromMarkdownString(initialValue, TRANSFORMERS);
      baselineMarkdownRef.current = $convertToMarkdownString(TRANSFORMERS);
    },
  }));

  if (!isMounted) {
    return <div id={id} className={styles.bodyField} aria-hidden="true" />;
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            id={id}
            className={styles.bodyField}
            role="textbox"
            aria-multiline="true"
            aria-labelledby={labelId}
          />
        }
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
      <EditableSyncPlugin disabled={disabled} />
      <ChangeTrackerPlugin onChange={onChange} baselineMarkdownRef={baselineMarkdownRef} />
    </LexicalComposer>
  );
}
