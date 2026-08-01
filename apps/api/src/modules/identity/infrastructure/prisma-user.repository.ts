import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { User } from '../../../generated/prisma/client';
import { normalizeEmail } from '../domain/email';

/**
 * Entrada de criação de `User` (AUTH-001). Deliberadamente sem
 * `passwordHash` calculado aqui dentro — quem chama já traz o hash pronto
 * (o serviço de hash é AUTH-002, ainda inexistente nesta tarefa). O mesmo
 * padrão já aparece em `ProvisionTenantUseCase` (DB-013): o repository não
 * decide como a senha vira hash, só persiste o que recebe.
 */
export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name?: string;
}

/**
 * Repository concreto (Prisma) de `User` (AUTH-001).
 *
 * Escopo estritamente `infrastructure/`: sem interface de domínio própria
 * ainda — diferente da AUTH-002 (hash de senha), esta tarefa não lista uma
 * pasta `domain/` em "Arquivos/áreas", e não existe hoje um segundo
 * consumidor/implementação que justifique uma porta abstrata (mesmo padrão
 * já usado por `ProvisionTenantUseCase`, injetado como classe concreta).
 * Quando um caso de uso de `identity` precisar de um contrato testável
 * (ex.: AUTH-005, login), essa interface nasce naquele momento.
 *
 * A regra de negócio "e-mail sempre normalizado para minúsculas antes de
 * salvar/consultar" (Architecture.md, Seção 15) vive em `normalizeEmail`
 * (`identity/domain/email.ts`), reaproveitada por este repository e por
 * `ProvisionTenantUseCase` (o outro ponto que cria `User` diretamente) —
 * nunca duplicada, para que nenhum caminho de escrita/leitura esqueça a
 * normalização.
 */
@Injectable()
export class PrismaUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        name: input.name,
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
  }
}
