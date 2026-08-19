import { z } from 'zod';

/**
 * Autor embutido no detalhe público de um Artigo (UXF-011) — subvisão de
 * `Author` específica deste contexto, não um `PublicAuthor` genérico:
 * nenhum outro consumidor público de Autor existe no backlog (nem página
 * dedicada), então esta forma não é promovida a um schema reutilizável
 * enquanto não houver um segundo consumidor real (mesmo critério de
 * `publicArticleProductSchema`, que também é uma subvisão contextual, não
 * um `PublicProduct` genérico).
 *
 * Só `name`/`avatarUrl` — `bio` explicitamente fora do contrato neste
 * ciclo (Etapa D), `id`/`siteId`/`userId` nunca expostos (Architecture.md
 * §29: "Contratos públicos nunca expõem campos administrativos ou
 * internos").
 *
 * `avatarUrl` nulável — `Author.avatarUrl` é `String?` no schema Prisma
 * (Autor sem avatar é um estado real, não um erro). Só `z.string().min(1)`,
 * sem `.url()`, mesmo critério já usado em toda URL de imagem do projeto
 * (`imageUrl`/`coverImageUrl`).
 */
export const publicArticleAuthorSchema = z.object({
  name: z.string().min(1),
  avatarUrl: z.string().min(1).nullable(),
});

export type PublicArticleAuthor = z.infer<typeof publicArticleAuthorSchema>;
