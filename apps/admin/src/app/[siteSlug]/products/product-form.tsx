'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { z } from 'zod';
import { uploadImageResponseSchema, type CategoryAdmin } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { fetchAllCategories } from './fetch-all-categories';
import styles from './product-form.module.css';

export interface ProductFormValues {
  name: string;
  slug: string;
  categoryId: string | null;
  description: string | null;
  imageUrl: string | null;
}

interface ProductFormProps {
  siteSlug: string;
  initialValues: ProductFormValues;
  submitLabel: string;
  onSubmit: (values: ProductFormValues) => Promise<void>;
}

type TextFieldErrors = Partial<Record<'name' | 'slug' | 'categoryId' | 'description', string>>;
type CategoriesState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: CategoryAdmin[] };

const GENERIC_SUBMIT_ERROR_MESSAGE = 'Não foi possível salvar o Produto. Tente novamente em instantes.';
const GENERIC_UPLOAD_ERROR_MESSAGE = 'Não foi possível enviar a imagem. Tente novamente em instantes.';
const GENERIC_CATEGORIES_ERROR_MESSAGE = 'Não foi possível carregar as Categorias.';

/**
 * Só os campos que o usuário digita/seleciona diretamente em controles de
 * texto/seleção — `imageUrl` não entra mais aqui (ver `handleSubmit`):
 * deixou de ser um valor controlado único, e o upload que o produz roda
 * fora deste schema, resolvido separadamente antes de montar o payload
 * final de `onSubmit`.
 */
const productTextFieldsSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  categoryId: z.string().uuid().nullable(),
  description: z.string().nullable(),
});

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
 * Formulário compartilhado entre criar (`/new`) e editar (`/:id`) Produto
 * (ADM-006) — específico de Produto, sem abstração genérica entre
 * entidades (mesmo critério da `CategoryForm`).
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
 * Upload de imagem (correção pós-ADM-006): selecionar/trocar arquivo NUNCA
 * envia nada pela rede — só guarda o `File` localmente (`selectedFile`) e
 * mostra um preview local via `URL.createObjectURL` (`previewUrl`). O
 * upload real acontece uma única vez, dentro do próprio `handleSubmit`,
 * antes do POST/PATCH do Product. Isso evita o bug relatado no teste
 * manual: selecionar o mesmo arquivo várias vezes antes de criar o
 * Product não gera mais um objeto novo no storage a cada seleção.
 *
 * `storedImageUrl` (não "confirmada"/"do Product") é deliberado: representa
 * só "este arquivo já existe no storage", não "este Product já referencia
 * esta imagem" — essas são coisas diferentes. Ela é atualizada assim que o
 * upload termina com sucesso, ANTES de `onSubmit` (o POST/PATCH) ser
 * chamado, e propositalmente não é revertida se o POST/PATCH falhar: uma
 * nova tentativa de salvar deve reaproveitar essa URL já enviada, nunca
 * refazer o upload do mesmo arquivo. Isso não resolve o caso de uma
 * imagem ficar órfã no storage se o POST/PATCH falhar depois de um upload
 * bem-sucedido — essa limitação é aceita, no mesmo espírito do trade-off
 * já documentado em Architecture.md Seção 29 ("a mesma imagem enviada
 * duas vezes gera dois uploads distintos, sem reuso"); não há endpoint de
 * exclusão de imagem para compensar isso, e nenhum foi criado aqui.
 */
export function ProductForm({ siteSlug, initialValues, submitLabel, onSubmit }: ProductFormProps) {
  const [name, setName] = useState(initialValues.name);
  const [slug, setSlug] = useState(initialValues.slug);
  const [categoryId, setCategoryId] = useState(initialValues.categoryId ?? '');
  const [description, setDescription] = useState(initialValues.description ?? '');
  const [storedImageUrl, setStoredImageUrl] = useState<string | null>(initialValues.imageUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [categoriesState, setCategoriesState] = useState<CategoriesState>({ status: 'loading' });
  const [fieldErrors, setFieldErrors] = useState<TextFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
   * sempre que `previewUrl` muda (troca de arquivo, remoção, ou submit
   * bem-sucedido zerando o preview) e também no desmonte — sem `setState`
   * no corpo do efeito, só na função de cleanup, então não esbarra em
   * `react-hooks/set-state-in-effect` (mesma lição já aplicada em
   * `OfferSection`).
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

    if (!file || isSubmitting) {
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleRemoveImage() {
    if (isSubmitting) {
      return;
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setStoredImageUrl(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setFormError(null);

    const parsed = productTextFieldsSchema.safeParse({
      name,
      slug,
      categoryId: categoryId === '' ? null : categoryId,
      description: description === '' ? null : description,
    });

    if (!parsed.success) {
      const errors: TextFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'name' || field === 'slug' || field === 'categoryId' || field === 'description') {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    let finalImageUrl = storedImageUrl;

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
        // `selectedFile`/`previewUrl` são limpos e `storedImageUrl` é
        // atualizado já, antes de chamar `onSubmit`. Uma nova tentativa de
        // salvar (se o passo seguinte falhar) reaproveita `finalImageUrl`
        // em vez de reenviar o mesmo arquivo.
        setSelectedFile(null);
        setPreviewUrl(null);
        setStoredImageUrl(finalImageUrl);
      } catch (error) {
        setFormError(resolveErrorMessage(error, GENERIC_UPLOAD_ERROR_MESSAGE, UPLOAD_BUSINESS_ERROR_STATUS_CODES));
        setIsSubmitting(false);
        // Upload falhou: o Product não pode ser criado/atualizado.
        return;
      }
    }

    try {
      await onSubmit({ ...parsed.data, imageUrl: finalImageUrl });
      setIsSubmitting(false);
    } catch (error) {
      setFormError(resolveErrorMessage(error, GENERIC_SUBMIT_ERROR_MESSAGE, SUBMIT_BUSINESS_ERROR_STATUS_CODES));
      setIsSubmitting(false);
    }
  }

  const categoryOptions =
    categoriesState.status === 'ready'
      ? categoriesState.items.filter((category) => !category.archivedAt || category.id === initialValues.categoryId)
      : [];

  const previewSrc = previewUrl ?? storedImageUrl;

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor="product-name">Nome</label>
        <input
          id="product-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? 'product-name-error' : undefined}
        />
        {fieldErrors.name && (
          <p id="product-name-error" role="alert" className={styles.fieldError}>
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="product-slug">Slug</label>
        <input
          id="product-slug"
          type="text"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.slug ? true : undefined}
          aria-describedby={fieldErrors.slug ? 'product-slug-error' : undefined}
        />
        {fieldErrors.slug && (
          <p id="product-slug-error" role="alert" className={styles.fieldError}>
            {fieldErrors.slug}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="product-category">Categoria</label>
        <select
          id="product-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          disabled={isSubmitting || categoriesState.status !== 'ready'}
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
          <p role="alert" className={styles.fieldError}>
            {GENERIC_CATEGORIES_ERROR_MESSAGE}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="product-description">Descrição</label>
        <textarea
          id="product-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="product-image">Imagem</label>
        {previewSrc && <img src={previewSrc} alt="Imagem do Produto" className={styles.preview} />}
        <input id="product-image" type="file" accept="image/*" onChange={handleFileChange} disabled={isSubmitting} />
        <div className={styles.imageActions}>
          {previewSrc && (
            <button type="button" onClick={handleRemoveImage} disabled={isSubmitting}>
              Remover imagem
            </button>
          )}
        </div>
      </div>

      {formError && (
        <p role="alert" className={styles.formError}>
          {formError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando...' : submitLabel}
      </button>
    </form>
  );
}
