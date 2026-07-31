import * as argon2 from 'argon2';
import type { PasswordHasher } from '../domain/password-hasher';

/**
 * Custo do Argon2id, nas unidades exigidas pelo pacote `argon2`:
 * - `memoryCost`: **KiB**, não MiB nem bytes — `19 * 1024` KiB = 19 MiB.
 * - `timeCost`: número de iterações.
 * - `parallelism`: número de lanes/threads.
 *
 * Todos opcionais no construtor de `Argon2PasswordHasher`: quem instancia
 * pode ajustar o custo real (ex.: aumentar em produção conforme o hardware
 * disponível) sem editar este arquivo. `DEFAULT_COST` só define o piso
 * seguro quando nenhuma opção é informada.
 */
export interface Argon2CostOptions {
  readonly memoryCost?: number;
  readonly timeCost?: number;
  readonly parallelism?: number;
}

/**
 * Mínimos recomendados pelo OWASP Password Storage Cheat Sheet para
 * Argon2id (perfil "primeira recomendação", 1 lane): 19 MiB de memória,
 * 2 iterações, paralelismo 1.
 */
const DEFAULT_COST: Required<Argon2CostOptions> = {
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Implementação concreta (Argon2id) de `PasswordHasher` (AUTH-002).
 *
 * Fica em `infrastructure/` porque depende diretamente da biblioteca
 * `argon2` — o domínio (`PasswordHasher`) não sabe, e não deveria saber,
 * que o algoritmo é Argon2id nem quais são os parâmetros de custo.
 *
 * Sem `@Injectable()`/import de `@nestjs/*` de propósito: nenhuma tarefa
 * até aqui liga esta classe a um módulo Nest real (login é AUTH-005,
 * criação de sessão é AUTH-003) — a forma de injeção (factory provider lendo
 * custo de variável de ambiente, por exemplo) é decisão de quem a consumir
 * primeiro, não desta tarefa.
 */
export class Argon2PasswordHasher implements PasswordHasher {
  private readonly cost: Required<Argon2CostOptions>;

  constructor(cost: Argon2CostOptions = {}) {
    this.cost = { ...DEFAULT_COST, ...cost };
  }

  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, {
      type: argon2.argon2id,
      memoryCost: this.cost.memoryCost,
      timeCost: this.cost.timeCost,
      parallelism: this.cost.parallelism,
    });
  }

  async verify(plainPassword: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, plainPassword);
  }
}
