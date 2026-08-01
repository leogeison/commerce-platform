import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { BootstrapAdminModule } from '../src/modules/identity/application/bootstrap-admin.module';
import { BootstrapAdminCommand } from '../src/modules/identity/application/bootstrap-admin.command';
import { validatePasswordConfirmation } from '../src/modules/identity/domain/password-confirmation';

/**
 * Entrypoint CLI da AUTH-013 — `pnpm --filter api run bootstrap:admin`.
 *
 * Única responsabilidade deste arquivo: argumentos de linha de comando,
 * prompt de senha sem eco, ciclo de vida do `ApplicationContext` e exit
 * code. Toda a lógica de negócio (hash, criação atômica) fica em
 * `BootstrapAdminCommand` — este script só chama.
 *
 * Nunca imprime senha, confirmação, hash, `DATABASE_URL` ou qualquer objeto
 * de erro bruto do Prisma (ver `describeBootstrapError` no fim do arquivo).
 */

interface CliArgs {
  email: string;
  userName: string | undefined;
  siteName: string;
  siteSlug: string;
  siteDomain: string;
  siteLocale: string;
}

const USAGE = `Uso:
  pnpm --filter api run bootstrap:admin -- \\
    --email admin@email.com \\
    --user-name "Nome do Administrador" \\
    --site-name "Nome do Site" \\
    --site-slug meu-site \\
    --site-domain meusite.com \\
    --site-locale pt-BR

--user-name é opcional. --site-locale tem default "pt-BR" se omitido.
A senha é solicitada interativamente depois, nunca como argumento.`;

function parseCliArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      email: { type: 'string' },
      'user-name': { type: 'string' },
      'site-name': { type: 'string' },
      'site-slug': { type: 'string' },
      'site-domain': { type: 'string' },
      'site-locale': { type: 'string', default: 'pt-BR' },
    },
  });

  const missing = (['email', 'site-name', 'site-slug', 'site-domain'] as const).filter(
    (key) => !values[key],
  );

  if (missing.length > 0) {
    console.error(`Argumentos obrigatórios ausentes: ${missing.join(', ')}.\n`);
    console.error(USAGE);
    process.exit(1);
  }

  return {
    email: values.email as string,
    userName: values['user-name'] as string | undefined,
    siteName: values['site-name'] as string,
    siteSlug: values['site-slug'] as string,
    siteDomain: values['site-domain'] as string,
    siteLocale: values['site-locale'] as string,
  };
}

// Códigos de controle tratados pelo prompt sem eco — escapes explícitos
// (nunca o byte de controle literal no código-fonte).
const KEY_ENTER_LF = '\n';
const KEY_ENTER_CR = '\r';
const KEY_CTRL_D = '\u0004';
const KEY_CTRL_C = '\u0003';
const KEY_BACKSPACE_DEL = '\u007f';
const KEY_BACKSPACE_BS = '\b';

/**
 * Lê uma linha do terminal sem ecoar o que foi digitado (senha). Raw mode
 * manual, sem dependência nova: cada tecla chega como `data` bruto, nunca é
 * escrita de volta em `stdout` — nem em texto claro, nem mascarada.
 *
 * Ctrl+C e Ctrl+D são tratados explicitamente. Em qualquer desfecho (linha
 * completa, Ctrl+C, ou erro), `cleanup()` sempre roda antes da Promise
 * resolver/rejeitar — restaura `setRawMode` e remove o listener, pra nunca
 * deixar o terminal (PowerShell/Git Bash) com a entrada quebrada depois que
 * o processo termina.
 */
function promptHiddenInput(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isTTY ? stdin.isRaw : false;
    let value = '';
    let settled = false;

    function cleanup(): void {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) {
        stdin.setRawMode(Boolean(wasRaw));
      }
      stdin.pause();
    }

    function onData(buffer: Buffer): void {
      if (settled) {
        return;
      }
      const char = buffer.toString('utf8');

      switch (char) {
        case KEY_ENTER_LF:
        case KEY_ENTER_CR:
          settled = true;
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          break;
        case KEY_CTRL_D:
          settled = true;
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          break;
        case KEY_CTRL_C:
          // Cancela sem deixar o terminal quebrado (raw mode já restaurado
          // por cleanup() antes do reject).
          settled = true;
          cleanup();
          process.stdout.write('\n');
          reject(new Error('CANCELLED'));
          break;
        case KEY_BACKSPACE_DEL:
        case KEY_BACKSPACE_BS:
          value = value.slice(0, -1);
          break;
        default:
          value += char;
          break;
      }
    }

    process.stdout.write(question);
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

/**
 * Mensagem segura por classe de erro conhecida — nunca `err.message`/
 * `err.stack` brutos, que podem conter detalhes internos do Prisma
 * (consulta, meta) que não devem aparecer no terminal.
 */
function describeBootstrapError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined;

  if (code === 'P2002') {
    return 'Já existe um registro com esses dados (e-mail, slug ou domínio já em uso).';
  }

  if (err instanceof Error && err.message === 'Senha não pode ser vazia.') {
    return err.message;
  }

  return 'Não foi possível criar o administrador. Verifique os dados informados e a conexão com o banco.';
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  let password: string;
  let confirmation: string;

  try {
    password = await promptHiddenInput('Senha: ');
    confirmation = await promptHiddenInput('Confirme a senha: ');
  } catch (err) {
    if (err instanceof Error && err.message === 'CANCELLED') {
      console.error('Operação cancelada.');
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const validation = validatePasswordConfirmation(password, confirmation);
  if (!validation.ok) {
    console.error(
      validation.reason === 'EMPTY'
        ? 'Senha não pode ser vazia.'
        : 'As senhas digitadas não coincidem.',
    );
    process.exitCode = 1;
    return;
  }

  let appContext: INestApplicationContext | undefined;
  try {
    appContext = await NestFactory.createApplicationContext(BootstrapAdminModule, {
      logger: false,
    });

    const command = appContext.get(BootstrapAdminCommand);
    await command.execute({
      email: args.email,
      password,
      userName: args.userName,
      siteName: args.siteName,
      siteSlug: args.siteSlug,
      siteDomain: args.siteDomain,
      siteLocale: args.siteLocale,
    });

    console.log('Administrador criado com sucesso.');
    console.log(`  E-mail: ${args.email}`);
    console.log(`  Site: ${args.siteName} (${args.siteSlug})`);
    console.log('  Role: OWNER');
  } catch (err) {
    console.error(describeBootstrapError(err));
    process.exitCode = 1;
  } finally {
    if (appContext) {
      await appContext.close();
    }
  }
}

main();
