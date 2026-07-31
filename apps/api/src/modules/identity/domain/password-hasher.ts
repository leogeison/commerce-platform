/**
 * Porta de domínio para hashing de senha (AUTH-002).
 *
 * Diferente da AUTH-001 (repository de `User`, só `infrastructure/`), esta
 * tarefa já lista uma pasta `domain/` própria em "Arquivos/áreas" — não é
 * abstração especulativa, é o que o backlog já prevê, porque já existe hoje
 * mais de uma implementação plausível (Argon2id, decidido para esta tarefa;
 * bcrypt era a alternativa avaliada).
 *
 * A interface não expõe nenhum detalhe do algoritmo escolhido nem dos
 * parâmetros de custo — quem consome isto (casos de uso de `identity`,
 * ainda não implementados) nunca decide como a senha vira hash, só que ela
 * precisa virar antes de ser persistida, e que pode ser conferida depois.
 */
export interface PasswordHasher {
  /** Recebe a senha em texto puro, devolve o hash pronto para persistir. */
  hash(plainPassword: string): Promise<string>;

  /**
   * Confere se `plainPassword` corresponde ao `hash` fornecido. Nunca lança
   * por senha incorreta — devolve `false`.
   */
  verify(plainPassword: string, hash: string): Promise<boolean>;
}
