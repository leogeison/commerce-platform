/**
 * Hash Argon2id fictício, fixo (AUTH-005) — usado por `LoginUseCase` quando
 * o e-mail informado não corresponde a nenhum `User`, para que o tempo de
 * resposta de "usuário não encontrado" seja indistinguível do de "senha
 * incorreta": os dois caminhos chamam `passwordHasher.verify()` com um
 * hash real, do mesmo custo (Argon2id é deliberadamente caro; pular a
 * verificação quando o usuário não existe criaria uma diferença de tempo
 * mensurável, explorável para enumerar e-mails cadastrados).
 *
 * Fixo, não gerado por requisição: gerar um hash novo a cada tentativa sem
 * usuário adicionaria um custo extra (a própria geração de hash, não só a
 * verificação) que as tentativas com usuário real não têm — reintroduziria
 * uma assimetria de tempo, só que na direção oposta.
 *
 * O texto original nunca importa e nunca é comparado com nenhuma senha
 * real — só existe para forçar o mesmo custo computacional de verificação.
 * Gerado uma única vez com os mesmos parâmetros de custo padrão de
 * `Argon2PasswordHasher` (19 MiB, 2 iterações, paralelismo 1):
 * `new Argon2PasswordHasher().hash('dummy-password-for-timing-safety')`.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$YFYjrt8ajs84g6+h1sJzmw$c87z/FeEVyuLPPfeE5W0w9G95zseIh8lCA3e/0GNfRk';
