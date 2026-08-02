import { z } from 'zod';
import { paginatedResponseSchema } from '../../common/paginated-response.js';
import { authorAdminSchema } from './author.js';

/**
 * Corpo de resposta de `GET /admin/sites/:siteSlug/authors` (EDT-002) —
 * envelope de paginação padrão (`common/paginated-response.ts`) em torno
 * de `authorAdminSchema`, mesmo padrão já usado em toda a API.
 */
export const listAuthorsResponseSchema = paginatedResponseSchema(authorAdminSchema);

export type ListAuthorsResponse = z.infer<typeof listAuthorsResponseSchema>;
