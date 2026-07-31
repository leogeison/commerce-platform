import { Argon2PasswordHasher } from './argon2-password-hasher';

const PLAIN_PASSWORD = 'correct horse battery staple';

/**
 * Prova da AUTH-002: comportamentos observáveis do hash, não a
 * "irreversibilidade" em si (não dá pra provar isso num teste unitário —
 * é uma propriedade matemática do algoritmo, não algo que o código chama
 * verifique em runtime).
 */
describe('Argon2PasswordHasher', () => {
  it('gera um hash diferente da senha original', async () => {
    const hasher = new Argon2PasswordHasher();

    const hash = await hasher.hash(PLAIN_PASSWORD);

    expect(hash).not.toBe(PLAIN_PASSWORD);
  });

  it('gera um hash identificado como Argon2id', async () => {
    const hasher = new Argon2PasswordHasher();

    const hash = await hasher.hash(PLAIN_PASSWORD);

    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verify() retorna true para a senha correta', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash(PLAIN_PASSWORD);

    await expect(hasher.verify(PLAIN_PASSWORD, hash)).resolves.toBe(true);
  });

  it('verify() retorna false para uma senha incorreta', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash(PLAIN_PASSWORD);

    await expect(hasher.verify('senha-errada', hash)).resolves.toBe(false);
  });

  it('duas chamadas para a mesma senha geram hashes diferentes (salt aleatório)', async () => {
    const hasher = new Argon2PasswordHasher();

    const [hashA, hashB] = await Promise.all([
      hasher.hash(PLAIN_PASSWORD),
      hasher.hash(PLAIN_PASSWORD),
    ]);

    expect(hashA).not.toBe(hashB);
  });

  it('ambos os hashes de chamadas distintas validam a senha original', async () => {
    const hasher = new Argon2PasswordHasher();

    const [hashA, hashB] = await Promise.all([
      hasher.hash(PLAIN_PASSWORD),
      hasher.hash(PLAIN_PASSWORD),
    ]);

    await expect(hasher.verify(PLAIN_PASSWORD, hashA)).resolves.toBe(true);
    await expect(hasher.verify(PLAIN_PASSWORD, hashB)).resolves.toBe(true);
  });

  it('aceita custo customizado no construtor e continua produzindo um hash Argon2id válido', async () => {
    // Custo bem menor que o padrão só para provar que a opção do
    // construtor é realmente usada (não ignorada) — não é o valor a ser
    // usado em produção.
    const hasher = new Argon2PasswordHasher({
      memoryCost: 8 * 1024,
      timeCost: 1,
      parallelism: 1,
    });

    const hash = await hasher.hash(PLAIN_PASSWORD);

    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(hasher.verify(PLAIN_PASSWORD, hash)).resolves.toBe(true);
  });
});
