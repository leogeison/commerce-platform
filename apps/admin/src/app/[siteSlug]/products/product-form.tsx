'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button, Text } from '@commerce-platform/ui';
import { updateProductRequestSchema, uploadImageResponseSchema, type CategoryAdmin } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { adminZodErrorMap } from '../../../lib/validation-messages';
import { fetchAllCategories } from '../../../lib/fetch-all-categories';
import { useSyncFormDirty } from '../unsaved-changes-context';

/**
 * UXA-013 — schema client-side de `ProductForm`, composto de
 * `updateProductRequestSchema` (`packages/contracts`) via `.unwrap()`, não
 * retipado à mão. `updateProductRequestSchema` já carrega as constraints
 * canônicas certas por campo (`.min(1)` em `name`/`slug`, `.uuid()` em
 * `categoryId`, `.nullable()` nos três campos opcionais) — qualquer mudança
 * futura nessas constraints em `packages/contracts` propaga aqui
 * automaticamente, sem duplicação.
 *
 * A única camada adicionada é estrutural, não de regra de negócio:
 * - `.unwrap()` remove o `.optional()` externo de cada campo — o PATCH
 *   parcial da API pode omitir qualquer campo, mas este formulário nunca
 *   omite (sempre tem um valor corrente, real ou `null`); "obrigatório mas
 *   nullable" é exatamente o que `unwrap()` produz a partir de
 *   `.nullable().optional()` (a ordem de encadeamento garante que
 *   `.optional()` é sempre o wrapper mais externo).
 * - `z.preprocess` em `categoryId`/`description` traduz o `''` nativo de
 *   `<select>`/`<textarea>` vazios para `null` — mesma tradução que já
 *   existia manualmente em `create-product.tsx` antes desta tarefa
 *   (`categoryId === '' ? null : categoryId`), agora centralizada no
 *   schema. `imageUrl` não usa `z.preprocess`: nunca é preenchido por um
 *   controle nativo (não há `<input>` registrado para ele) — é escrito
 *   exclusivamente via `setValue('imageUrl', ..., { shouldDirty: true })`,
 *   sempre como string real ou `null` explícito, nunca `''` (ver
 *   `handleFileChange`/`handleRemoveImage`/`onValid` abaixo).
 *
 * Verificado empiricamente (compilação isolada + `formState.isDirty` real
 * em teste) antes da implementação: a composição é type-safe (a saída de
 * `categoryId`/`description`/`imageUrl` é `string | null`, nunca `string`)
 * e produz os mesmos códigos de issue Zod (`too_small`/origin `string`) já
 * tratados por `adminZodErrorMap` para Categoria — nenhuma extensão de
 * `validation-messages.ts` foi necessária.
 */
const productFormValuesSchema = z.object({
  name: updateProductRequestSchema.shape.name.unwrap(),
  slug: updateProductRequestSchema.shape.slug.unwrap(),
  categoryId: z.preprocess(
    (value) => (value === '' ? null : value),
    updateProductRequestSchema.shape.categoryId.unwrap(),
  ),
  description: z.preprocess(
    (value) => (value === '' ? null : value),
    updateProductRequestSchema.shape.description.unwrap(),
  ),
  imageUrl: updateProductRequestSchema.shape.imageUrl.unwrap(),
});

type ProductFormInput = z.input<typeof productFormValuesSchema>;
export type ProductFormValues = z.output<typeof productFormValuesSchema>;

interface ProductFormProps {
  siteSlug: string;
  initialValues: ProductFormValues;
  submitLabel: string;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  onSuccess?: () => void;
}

type CategoriesState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: CategoryAdmin[] };

const GENERIC_SUBMIT_ERROR_MESSAGE = 'Não foi possível salvar o Produto. Tente novamente em instantes.';
const GENERIC_UPLOAD_ERROR_MESSAGE = 'Não foi possível enviar a imagem. Tente novamente em instantes.';
const GENERIC_CATEGORIES_ERROR_MESSAGE = 'Não foi possível carregar as Categorias.';

/**
 * `403`/`404`/`409`/`422` são as respostas de negócio estruturadas e
 * seguras já convencionadas desde a ADM-005 (`CategoryForm`). `400` entra
 * só no conjunto do upload porque `UploadImageController` sempre devolve,
 * para esse status, uma das três mensagens fixas e seguras já conhecidas
 * ("Arquivo não enviado.", "Arquivo excede o tamanho máximo permitido.",
 * "Formato de arquivo não permitido.") — nunca detalhe interno.
 */
const SUBMIT_BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);
const UPLOAD_BUSINESS_ERROR_STATUS_CODES = new Set([400, 403, 404, 409, 422]);

function resolveErrorMessage(error: unknown, generic: string, businessStatusCodes: Set<number>): string {
  if (error instanceof AdminApiError && error.statusCode !== undefined && businessStatusCodes.has(error.statusCode)) {
    return error.message;
  }
  return generic;
}

/**
 * Converte `ProductFormValues` (saída validada, `categoryId`/`description`
 * nuláveis) para o formato de entrada que os controles nativos precisam
 * (`''` para "vazio", nunca `null`) — usado tanto para `defaultValues`
 * quanto para o `reset()` pós-salvamento, sempre o inverso exato do
 * `z.preprocess` do schema.
 */
function toFormInput(values: ProductFormValues): ProductFormInput {
  return {
    name: values.name,
    slug: values.slug,
    categoryId: values.categoryId ?? '',
    description: values.description ?? '',
    imageUrl: values.imageUrl,
  };
}

/**
 * Formulário compartilhado entre criar (`/new`) e editar (`/:id`) Produto
 * (ADM-006) — específico de Produto, sem abstração genérica entre
 * entidades (mesmo critério da `CategoryForm`).
 *
 * UXA-013 — migração completa para os padrões já provados em Categoria
 * (UXA-001 a UXA-005A), aplicados aqui pela primeira vez a Produto (o
 * formulário anterior a esta tarefa nunca teve nenhum dos cinco):
 * `react-hook-form` + `zodResolver(productFormValuesSchema, { error:
 * adminZodErrorMap })`, `useSyncFormDirty(isDirty)` (UXA-003), `onSuccess`
 * chamado só depois de `reset()` (UXA-004, toast fica por conta de quem
 * chama — `CreateProduct`/`ProductDetail`), `shouldFocusError: true`
 * (mesmo mecanismo que move o foco ao primeiro campo inválido em
 * Categoria). `isSaving` (estado próprio, não `formState.isSubmitting`)
 * pela mesma razão documentada em `CategoryForm`: `isSubmitting` da RHF
 * alterna mesmo em tentativa que falha só na validação, e desabilitar
 * campos nesse instante impediria o foco automático no campo inválido.
 *
 * Upload de imagem — semântica 100% preservada da versão anterior a esta
 * tarefa, só agora também espelhada no campo `imageUrl` da RHF (ver
 * `productFormValuesSchema`, acima) para participar de `formState.isDirty`:
 * selecionar/trocar arquivo NUNCA envia nada pela rede — só guarda o
 * `File` localmente (`selectedFile`) e mostra um preview local via
 * `URL.createObjectURL` (`previewUrl`), exatamente como antes. O upload
 * real acontece uma única vez, dentro do próprio `onValid`, antes do
 * POST/PATCH do Produto. A cada um dos três pontos onde o valor final de
 * `imageUrl` muda de verdade, `setValue('imageUrl', ..., { shouldDirty:
 * true })` é chamado, na MESMA ordem/local exatos onde a versão anterior
 * já atualizava seu próprio estado equivalente:
 * 1. `handleFileChange` — arquivo selecionado: `imageUrl` vira o
 *    `previewUrl` local (marca dirty mesmo antes de qualquer upload —
 *    upload só acontece no submit).
 * 2. `handleRemoveImage` — imagem removida: `imageUrl` vira `null`.
 * 3. Upload concluído com sucesso dentro de `onValid` — `imageUrl` vira a
 *    URL real do storage, substituindo o `previewUrl` local; se o
 *    POST/PATCH do Produto falhar depois disso, esta URL já enviada é
 *    reaproveitada numa nova tentativa (nunca reenviada), e o formulário
 *    continua dirty (ainda não foi salvo).
 *
 * A leitura de exibição (`previewSrc`) usa `useWatch({ control, name:
 * 'imageUrl' })` como fonte do valor "confirmado atual" — substitui o
 * antigo `storedImageUrl` (useState) sem mudar nenhum dos três pontos de
 * escrita nem o comportamento visual: mesmo fallback `previewUrl ?? <valor
 * confirmado>`. `useWatch` (não o `watch()` retornado por `useForm`) é
 * usado deliberadamente: `watch()` é uma função não memoizável — o React
 * Compiler não consegue garantir que chamá-la de novo produz o mesmo
 * resultado, então desativa a memoização do componente inteiro
 * (`react-hooks/incompatible-library`). `useWatch` é o próprio hook da RHF
 * para este caso — assina só o campo pedido (`name: 'imageUrl'`) via
 * Context, compatível com o Compiler, e dispara re-render apenas quando
 * esse campo muda (mais preciso que `watch()`, que seria uma única função
 * "observar tudo"). Mesma fonte de verdade, mesmo valor, nenhuma mudança
 * de comportamento — só o mecanismo de leitura.
 *
 * `reset(toFormInput({ ...data, imageUrl: finalImageUrl }))` só roda
 * depois que a persistência é bem-sucedida — estabelece o novo baseline
 * (nome/slug/categoria/descrição digitados + URL real da imagem, nunca a
 * `previewUrl` local) e zera `formState.isDirty`, exatamente o requisito
 * de fechar o guard de navegação após salvar com sucesso. Em erro (upload
 * ou submissão), nenhum `reset()` roda — os valores digitados e o estado
 * de dirty permanecem, incluindo o caso em que o upload já teve sucesso
 * mas o POST/PATCH falhou depois (a imagem já está no storage, mas o
 * Produto ainda não foi salvo — continua sujo, corretamente).
 *
 * Busca as próprias opções de Categoria (`fetchAllCategories`) — dono
 * único desse dado, nenhum dos dois chamadores (`CreateProduct`/
 * `ProductDetail`) precisa buscar ou filtrar isso por fora. O filtro
 * `!archivedAt || id === initialValues.categoryId` resolve os dois modos
 * com uma única expressão: na criação, `initialValues.categoryId` é
 * `null`, então nenhuma Categoria arquivada nunca bate com ele e todas
 * ficam de fora; na edição, só a Categoria já vinculada (se estiver
 * arquivada) entra como exceção, identificada com "(arquivada)" — nunca
 * como opção nova de vínculo.
 *
 * UXA-013 — apresentação migrada de CSS Module para Tailwind v4 + tokens
 * do design system + primitives `Button`/`Text` (`packages/ui`), mesmo
 * vocabulário já usado em `CategoryForm`. `<input>`/`<select>`/`<textarea>`
 * permanecem HTML nativo com classes Tailwind locais — nenhuma primitive
 * de campo de formulário em `packages/ui`.
 */
export function ProductForm({ siteSlug, initialValues, submitLabel, onSubmit, onSuccess }: ProductFormProps) {
  const [categoriesState, setCategoriesState] = useState<CategoriesState>({ status: 'loading' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormValuesSchema, { error: adminZodErrorMap }),
    defaultValues: toFormInput(initialValues),
    shouldFocusError: true,
  });

  useSyncFormDirty(isDirty);

  useEffect(() => {
    let cancelled = false;

    fetchAllCategories(siteSlug)
      .then((items) => {
        if (cancelled) {
          return;
        }
        setCategoriesState({ status: 'ready', items });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setCategoriesState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  /**
   * Único dono do ciclo de vida do blob local: revoga a URL anterior
   * sempre que `previewUrl` muda (troca de arquivo, remoção, ou upload
   * concluído zerando o preview) e também no desmonte — sem `setState` no
   * corpo do efeito, só na função de cleanup (mesma lição já aplicada em
   * `OfferSection`). Comportamento idêntico ao existente antes desta
   * tarefa.
   */
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Reseta o valor do input imediatamente: sem isso, selecionar o MESMO
    // arquivo de novo não dispararia um novo evento `change`.
    event.target.value = '';

    if (!file || isSaving) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);
    setValue('imageUrl', objectUrl, { shouldDirty: true });
  }

  function handleRemoveImage() {
    if (isSaving) {
      return;
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setValue('imageUrl', null, { shouldDirty: true });
  }

  async function onValid(data: ProductFormValues) {
    setFormError(null);
    setIsSaving(true);

    let finalImageUrl = data.imageUrl;

    if (selectedFile) {
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('purpose', 'PRODUCT');

        const { url } = await apiRequest(
          `/admin/sites/${encodeURIComponent(siteSlug)}/uploads/images`,
          uploadImageResponseSchema,
          { method: 'POST', body: formData },
        );

        finalImageUrl = url;
        // Upload confirmado: o arquivo já existe no storage a partir daqui,
        // independentemente do resultado do POST/PATCH abaixo — por isso
        // `selectedFile`/`previewUrl` são limpos e o campo `imageUrl` da
        // RHF é atualizado já, antes de chamar `onSubmit`. Uma nova
        // tentativa de salvar (se o passo seguinte falhar) reaproveita
        // `finalImageUrl` em vez de reenviar o mesmo arquivo, e o
        // formulário continua dirty (ainda não foi persistido).
        setSelectedFile(null);
        setPreviewUrl(null);
        setValue('imageUrl', finalImageUrl, { shouldDirty: true });
      } catch (error) {
        setFormError(resolveErrorMessage(error, GENERIC_UPLOAD_ERROR_MESSAGE, UPLOAD_BUSINESS_ERROR_STATUS_CODES));
        setIsSaving(false);
        // Upload falhou: o Produto não pode ser criado/atualizado.
        return;
      }
    }

    const finalValues: ProductFormValues = { ...data, imageUrl: finalImageUrl };

    try {
      await onSubmit(finalValues);
      reset(toFormInput(finalValues));
      onSuccess?.();
    } catch (error) {
      setFormError(resolveErrorMessage(error, GENERIC_SUBMIT_ERROR_MESSAGE, SUBMIT_BUSINESS_ERROR_STATUS_CODES));
    } finally {
      setIsSaving(false);
    }
  }

  const categoryOptions =
    categoriesState.status === 'ready'
      ? categoriesState.items.filter((category) => !category.archivedAt || category.id === initialValues.categoryId)
      : [];

  const currentImageUrl = useWatch({ control, name: 'imageUrl' });
  const previewSrc = previewUrl ?? currentImageUrl;

  return (
    <form className="flex w-full max-w-xs flex-col gap-4" onSubmit={handleSubmit(onValid)} noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="product-name" className="font-ui text-body-sm font-action">
          Nome
        </label>
        <input
          id="product-name"
          type="text"
          disabled={isSaving}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'product-name-error' : undefined}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body aria-[invalid=true]:border-[var(--color-feedback-danger-fill)]"
          {...register('name')}
        />
        {errors.name && (
          <Text id="product-name-error" role="alert" tone="danger" variant="body-sm" className="m-0">
            {errors.name.message}
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="product-slug" className="font-ui text-body-sm font-action">
          Slug
        </label>
        <input
          id="product-slug"
          type="text"
          disabled={isSaving}
          aria-invalid={errors.slug ? true : undefined}
          aria-describedby={errors.slug ? 'product-slug-error' : undefined}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body aria-[invalid=true]:border-[var(--color-feedback-danger-fill)]"
          {...register('slug')}
        />
        {errors.slug && (
          <Text id="product-slug-error" role="alert" tone="danger" variant="body-sm" className="m-0">
            {errors.slug.message}
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="product-category" className="font-ui text-body-sm font-action">
          Categoria
        </label>
        <select
          id="product-category"
          disabled={isSaving || categoriesState.status !== 'ready'}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body"
          {...register('categoryId')}
        >
          <option value="">Nenhuma</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.archivedAt ? ' (arquivada)' : ''}
            </option>
          ))}
        </select>
        {categoriesState.status === 'error' && (
          <Text role="alert" tone="danger" variant="body-sm" className="m-0">
            {GENERIC_CATEGORIES_ERROR_MESSAGE}
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="product-description" className="font-ui text-body-sm font-action">
          Descrição
        </label>
        <textarea
          id="product-description"
          disabled={isSaving}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body"
          {...register('description')}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="product-image" className="font-ui text-body-sm font-action">
          Imagem
        </label>
        {previewSrc && (
          <img
            src={previewSrc}
            alt="Imagem do Produto"
            className="max-h-[160px] max-w-[160px] rounded-control border border-outline object-contain"
          />
        )}
        <input
          id="product-image"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={isSaving}
          className="font-ui text-body-sm"
        />
        {previewSrc && (
          <Button type="button" variant="secondary" size="sm" onClick={handleRemoveImage} disabled={isSaving} className="self-start">
            Remover imagem
          </Button>
        )}
      </div>

      {formError && (
        <Text role="alert" tone="danger" variant="body-sm" className="m-0">
          {formError}
        </Text>
      )}

      <Button type="submit" disabled={isSaving} className="self-start">
        {isSaving ? 'Salvando...' : submitLabel}
      </Button>
    </form>
  );
}
