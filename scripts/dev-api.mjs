#!/usr/bin/env node
/**
 * Orquestrador multiplataforma do `pnpm run dev:api`.
 *
 * Responsabilidades:
 *   1. contracts: `tsc --watch` (só recompila packages/contracts/src -> dist).
 *   2. api:       `tsc -p tsconfig.build.json --watch --preserveWatchOutput`
 *      (só recompila apps/api/src -> dist; usamos tsc puro em vez de
 *      `nest build --watch` porque `nest-cli.json` tem `deleteOutDir: true`,
 *      o que apagaria `apps/api/dist` inteiro a cada recompilação. `nest
 *      build` não usa plugins/webpack aqui, então `tsc -p tsconfig.build.json`
 *      produz exatamente a mesma saída). Os dois watchers são invocados como
 *      `node <typescript/bin/tsc>` direto (ver `tscBinPath`), não `pnpm run
 *      ...` — evita o shim `.cmd` do Windows, que mostra "Terminate batch
 *      job (Y/N)?" quando o Ctrl+C do terminal chega no `cmd.exe` por trás
 *      dele.
 *   3. api instance: o orquestrador supervisiona `node dist/main.js`
 *      DIRETAMENTE (cwd = apps/api, para o ConfigModule achar o `.env` da
 *      API sem mover/duplicar nada). Não há mais `nodemon`/observação de
 *      arquivos em `dist/**` — no Windows, o mecanismo nativo de notificação
 *      de arquivos (chokidar) se mostrou instável mesmo depois de uma
 *      barreira de estabilização por polling, entrando em "restart storm"
 *      só de começar a observar. Os dois `tsc --watch` já são a única fonte
 *      de verdade sobre quando recompilar; o restart é disparado pelas
 *      PRÓPRIAS mensagens de compilação deles, nunca por observação de
 *      arquivo.
 *
 * Barreira de prontidão inicial: cada watcher só libera o próximo passo na
 * primeira compilação SEM erros. Depois disso, os dois watchers continuam
 * sendo monitorados pelo resto da sessão — toda compilação seguinte
 * (sucesso ou erro) atualiza um estado central (`compilerState`) que decide
 * quando é seguro reiniciar a API.
 *
 * Coordenação do restart:
 *   - nunca reinicia com QUALQUER watcher ainda compilando ou com erro;
 *   - debounce único e compartilhado (não um timer por watcher), para que
 *     uma recompilação de contracts seguida da recompilação em cascata da
 *     API vire só um restart;
 *   - barreira específica contracts -> api: quando contracts termina limpo,
 *     não agenda restart na hora — espera até 1.5s para ver se a API começa
 *     a recompilar em consequência (import de tipos/schemas). Se começar,
 *     só reinicia quando ELA terminar; se a janela expirar sem sinal, segue
 *     com um restart normal (contracts mudou e precisa ser recarregado
 *     mesmo sem a API ter recompilado nada);
 *   - pedidos que chegam enquanto um restart já está em andamento são
 *     consolidados em no máximo mais UM restart posterior;
 *   - a API anterior é morta (tree-kill) e o `exit` real é aguardado antes
 *     de subir a próxima — nunca duas instâncias simultâneas;
 *   - a API caindo sozinha (fora de um restart pedido por nós) só é logada
 *     — não tentamos reiniciar automaticamente; a próxima compilação limpa
 *     de qualquer watcher já cobre religar a API normalmente.
 *
 * Implementado como script Node usando `cross-spawn` (resolve `pnpm`/`node`
 * de forma consistente em PowerShell, CMD, Git Bash e Linux, inclusive os
 * shims `.cmd` do Windows) e `tree-kill` (encerra a árvore de processos
 * inteira, não só o processo imediato) — para funcionar de forma idêntica
 * em PowerShell, CMD, Git Bash, Linux e CI, sem depender de bash.
 */

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';
import treeKill from 'tree-kill';

// Caminhos calculados a partir da localização real deste arquivo (não de
// `process.cwd()`), para que o script funcione mesmo se invocado de outro
// diretório.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(REPO_ROOT, 'apps', 'api');
const CONTRACTS_DIR = path.join(REPO_ROOT, 'packages', 'contracts');

// Caminho real do `tsc` (arquivo JS puro, com shebang `#!/usr/bin/env node`
// — não um shim `.cmd`/`.ps1`) dentro do node_modules de cada pacote. Os
// watchers rodam `node <esse arquivo>` diretamente em vez de `pnpm run
// dev`/`pnpm run build:watch`: no Windows, `pnpm` (e `tsc` via
// node_modules/.bin) são shims `.cmd`, executados por baixo dos panos por um
// `cmd.exe`. Como esse `cmd.exe` fica preso ao mesmo console do processo
// principal, um Ctrl+C no terminal é entregue a ele diretamente (além do
// SIGINT que o Node recebe) e ele mostra "Terminate batch job (Y/N)?" —
// puro ruído visual (o `tree-kill` já força o encerramento via `taskkill /T
// /F` de qualquer forma, ver shutdown()), mas invocar `node` sem nenhum
// `.cmd` no meio elimina esse prompt por completo.
function tscBinPath(packageDir) {
  return path.join(packageDir, 'node_modules', 'typescript', 'bin', 'tsc');
}

// Handshake inicial: exige "0 erros" explícito antes de liberar o próximo
// passo — "Watching for file changes." sozinho também aparece após uma
// compilação com erro.
const READY_TIMEOUT_MS = 60_000;

// Início de uma (re)compilação — tanto a primeira quanto incrementais.
const COMPILE_START_PATTERN = /(starting compilation in watch mode|file change detected.*starting incremental compilation)/i;
// Fim de uma compilação, com a contagem de erros capturada.
const COMPILE_DONE_PATTERN = /found\s+(\d+)\s+errors?.*watching for file changes/i;

// Debounce central do restart (compartilhado pelos dois watchers).
const RESTART_DEBOUNCE_MS = 400;
// Janela específica para esperar a recompilação em cascata da API depois
// que contracts termina limpo, antes de decidir reiniciar sem ela.
const CONTRACTS_CASCADE_WINDOW_MS = 1500;
// Tempo máximo esperando a instância anterior da API confirmar o próprio
// encerramento antes de desistir e falhar explicitamente (nunca sobe uma
// instância nova sem essa confirmação).
const API_STOP_TIMEOUT_MS = 10_000;

// Remove sequências ANSI (cores) que o `tsc` pode emitir, para não atrapalhar
// os testes de regex acima.
// eslint-disable-next-line no-control-regex -- ESC (\x1b) é o caractere que abre sequências ANSI; é o alvo, não um acidente.
const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;
function stripAnsi(text) {
  return text.replace(ANSI_PATTERN, '');
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** @type {import('child_process').ChildProcess[]} */
const children = []; // só os dois watchers — a instância da API é gerenciada à parte (apiChild)
let shuttingDown = false;

let apiChild = null;
let intentionalStopTarget = null; // child que estamos derrubando de propósito (restart), não um crash
let apiRestartInFlight = false;
let apiRestartPending = false;

const compilerState = {
  contracts: { compiling: false, hasErrors: false, seenFirstReady: false },
  api: { compiling: false, hasErrors: false, seenFirstReady: false },
};
let restartRequested = false;
let restartDebounceTimer = null;
let awaitingApiAfterContracts = false;
let contractsCascadeTimer = null;

/**
 * Executa um passo síncrono (build inicial) e resolve quando o processo
 * termina com sucesso. Rejeita em qualquer código de saída != 0 ou se o
 * processo nem conseguir iniciar.
 */
function runStep(label, command, args) {
  console.log(`[dev-api] ${label}...`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', (err) => reject(new Error(`${label}: falha ao iniciar (${err.message}).`)));
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} falhou (código ${code}).`));
      }
    });
  });
}

/**
 * Envolve um stream (stdout/stderr) num EventEmitter que emite 'line' por
 * linha completa, mantendo um buffer próprio para não assumir que cada
 * evento 'data' corresponde a uma linha inteira.
 */
function createLineEmitter(stream) {
  const emitter = new EventEmitter();
  if (!stream) {
    return emitter;
  }
  stream.setEncoding('utf8');
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      emitter.emit('line', line);
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) {
      emitter.emit('line', buffer);
      buffer = '';
    }
  });
  return emitter;
}

/**
 * Sobe um watcher de longa duração, registra para encerramento conjunto e
 * encaminha stdout/stderr ao terminal prefixados com `[name]`, preservando
 * linhas completas.
 *
 * Qualquer encerramento inesperado de um WATCHER (não da instância da API,
 * que tem política própria) ainda derruba toda a sessão via shutdown(1):
 * sem um dos dois watchers, nada mais compila, a sessão de dev não tem como
 * continuar de forma útil.
 */
function spawnWatcher(name, command, args, options = {}) {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);

  const stdoutLines = createLineEmitter(child.stdout);
  const stderrLines = createLineEmitter(child.stderr);
  stdoutLines.on('line', (line) => console.log(`[${name}] ${line}`));
  stderrLines.on('line', (line) => console.error(`[${name}] ${line}`));

  child.on('error', (err) => {
    if (shuttingDown) {
      return;
    }
    console.error(`[dev-api] processo "${name}" falhou ao iniciar: ${err.message}. Encerrando os demais...`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }
    console.error(
      `[dev-api] processo "${name}" encerrou inesperadamente (code=${code}, signal=${signal}). Encerrando os demais...`,
    );
    shutdown(1);
  });

  return { child, stdoutLines, stderrLines };
}

function cancelScheduledRestart() {
  if (restartDebounceTimer) {
    clearTimeout(restartDebounceTimer);
    restartDebounceTimer = null;
  }
}

/**
 * Único coordenador que decide se/quando um restart pode acontecer. Nunca
 * age enquanto: não há pedido pendente; estamos aguardando a possível
 * cascata contracts -> api; qualquer watcher está compilando; qualquer
 * watcher está com erro. Reavalia essas condições de novo depois do
 * debounce, porque uma nova compilação pode ter começado durante a janela.
 */
function maybeScheduleRestart() {
  if (!restartRequested) {
    return;
  }
  if (awaitingApiAfterContracts) {
    return;
  }
  if (compilerState.contracts.compiling || compilerState.api.compiling) {
    return;
  }
  if (compilerState.contracts.hasErrors || compilerState.api.hasErrors) {
    return;
  }

  cancelScheduledRestart();
  restartDebounceTimer = setTimeout(() => {
    restartDebounceTimer = null;
    if (
      restartRequested &&
      !awaitingApiAfterContracts &&
      !compilerState.contracts.compiling &&
      !compilerState.api.compiling &&
      !compilerState.contracts.hasErrors &&
      !compilerState.api.hasErrors
    ) {
      restartRequested = false;
      void restartApi();
    }
  }, RESTART_DEBOUNCE_MS);
}

/**
 * Aguarda a primeira compilação sem erros de um watcher (handshake inicial)
 * e, a partir daí, mantém um listener permanente nas suas linhas de saída
 * para alimentar `compilerState` e a coordenação de restart pelo resto da
 * sessão. A primeira mensagem de sucesso NUNCA é interpretada como pedido
 * de restart — só libera a promise de prontidão.
 */
function attachWatcherLifecycle(key, name, monitored, timeoutMs) {
  const { child, stdoutLines, stderrLines } = monitored;
  const state = compilerState[key];

  return new Promise((resolve, reject) => {
    let settled = false;

    function settle(fn) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      child.off('error', onError);
      child.off('exit', onExit);
      fn();
    }

    function onError(err) {
      settle(() => reject(new Error(`"${name}" falhou ao iniciar: ${err.message}.`)));
    }

    function onExit(code, signal) {
      settle(() =>
        reject(new Error(`"${name}" encerrou antes de ficar pronto (code=${code}, signal=${signal}).`)),
      );
    }

    const timeoutId = setTimeout(() => {
      settle(() => reject(new Error(`"${name}" não sinalizou compilação sem erros em ${timeoutMs / 1000}s.`)));
    }, timeoutMs);

    child.on('error', onError);
    child.on('exit', onExit);

    function handleLine(rawLine) {
      const clean = stripAnsi(rawLine);

      if (COMPILE_START_PATTERN.test(clean)) {
        state.compiling = true;
        cancelScheduledRestart();
        if (key === 'api' && awaitingApiAfterContracts) {
          awaitingApiAfterContracts = false;
          if (contractsCascadeTimer) {
            clearTimeout(contractsCascadeTimer);
            contractsCascadeTimer = null;
          }
        }
        return;
      }

      const doneMatch = clean.match(COMPILE_DONE_PATTERN);
      if (!doneMatch) {
        return;
      }

      const errorCount = Number(doneMatch[1]);
      state.compiling = false;
      state.hasErrors = errorCount > 0;

      if (!state.seenFirstReady) {
        if (errorCount === 0) {
          state.seenFirstReady = true;
          settle(() => resolve());
        }
        // primeira compilação com erro: não resolve, não conta como pedido
        // de restart — o watcher segue rodando até compilar limpo.
        return;
      }

      if (errorCount === 0) {
        if (key === 'contracts') {
          // não agenda restart na hora: espera até CONTRACTS_CASCADE_WINDOW_MS
          // para ver se a API recompila em consequência.
          restartRequested = true;
          awaitingApiAfterContracts = true;
          if (contractsCascadeTimer) {
            clearTimeout(contractsCascadeTimer);
          }
          contractsCascadeTimer = setTimeout(() => {
            contractsCascadeTimer = null;
            awaitingApiAfterContracts = false;
            maybeScheduleRestart();
          }, CONTRACTS_CASCADE_WINDOW_MS);
        } else {
          restartRequested = true;
        }
      }
      maybeScheduleRestart();
    }

    stdoutLines.on('line', handleLine);
    stderrLines.on('line', handleLine);
    // handleLine fica permanentemente anexado — precisamos continuar
    // detectando compilações futuras pelo resto da vida do watcher.
  });
}

/** Sobe `node dist/main.js` com cwd = apps/api, prefixando os logs com `[api]`. */
function startApiInstance() {
  console.log('[dev-api] iniciando node dist/main.js...');
  const child = spawn('node', ['dist/main.js'], { cwd: API_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
  apiChild = child;

  const stdoutLines = createLineEmitter(child.stdout);
  const stderrLines = createLineEmitter(child.stderr);
  stdoutLines.on('line', (line) => console.log(`[api] ${line}`));
  stderrLines.on('line', (line) => console.error(`[api] ${line}`));

  child.on('error', (err) => {
    console.error(`[dev-api] api falhou ao iniciar: ${err.message}.`);
  });

  child.on('exit', (code, signal) => {
    if (apiChild === child) {
      apiChild = null;
    }
    const wasIntentional = intentionalStopTarget === child;
    if (wasIntentional) {
      intentionalStopTarget = null;
    }
    if (!wasIntentional && !shuttingDown) {
      console.error(`[dev-api] api encerrou inesperadamente (code=${code}, signal=${signal}).`);
      console.error('[dev-api] aguardando recompilação bem-sucedida ou encerramento do script.');
    }
  });

  return child;
}

/**
 * Mata a instância atual da API (se existir) e só resolve depois de
 * confirmar sua saída real — nunca por suposição. Trata: API já encerrada
 * antes da chamada; `exit` ocorrido entre a checagem e a instalação do
 * listener; `treeKill` retornando erro porque o processo já não existe;
 * timeout de segurança que verifica se o processo realmente desapareceu
 * antes de decidir (e nunca permite prosseguir com ele ainda vivo).
 */
function stopApiInstance() {
  const child = apiChild;
  if (!child || child.pid === null || child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  intentionalStopTarget = child;

  return new Promise((resolve, reject) => {
    let settled = false;
    let treeKillErr = null;

    function settle(fn) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      child.removeListener('exit', onExit);
      fn();
    }

    function onExit() {
      settle(resolve);
    }

    // Instalado antes de qualquer nova checagem/ação, para não perder um
    // 'exit' que ocorra entre a checagem inicial (acima) e o treeKill.
    child.once('exit', onExit);

    // `timeoutId` é criado (const, atribuído uma única vez) ANTES de
    // qualquer caminho síncrono que possa chamar `settle()` — evita
    // depender da inicialização posterior de um valor capturado pelos
    // callbacks acima.
    const timeoutId = setTimeout(() => {
      if (isProcessAlive(child.pid)) {
        const suffix = treeKillErr ? ` (treeKill também falhou: ${treeKillErr.message})` : '';
        settle(() =>
          reject(
            new Error(
              `pid ${child.pid} não confirmou encerramento em ${API_STOP_TIMEOUT_MS / 1000}s${suffix} — abortando restart para não rodar duas instâncias.`,
            ),
          ),
        );
      } else {
        settle(resolve);
      }
    }, API_STOP_TIMEOUT_MS);

    if (child.exitCode !== null || child.signalCode !== null) {
      settle(resolve);
      return;
    }

    treeKill(child.pid, 'SIGTERM', (err) => {
      if (err) {
        treeKillErr = err;
        if (!isProcessAlive(child.pid)) {
          settle(resolve);
        }
        // se ainda está vivo, segue aguardando o 'exit' real ou o timeout.
      }
    });
  }).finally(() => {
    // Limpeza defensiva: garante que intentionalStopTarget não fique preso
    // caso o 'exit' já tenha sido perdido/tratado por outro caminho.
    if (intentionalStopTarget === child) {
      intentionalStopTarget = null;
    }
  });
}

/**
 * Reinicia a API: mata a instância atual (aguardando a saída real) e só
 * então sobe a próxima. Pedidos que cheguem enquanto um restart já está em
 * andamento são consolidados em no máximo mais UMA rodada posterior — nunca
 * duas instâncias simultâneas.
 */
async function restartApi() {
  if (apiRestartInFlight) {
    apiRestartPending = true;
    return;
  }
  apiRestartInFlight = true;
  try {
    do {
      apiRestartPending = false;
      console.log('[dev-api] reiniciando a API...');
      try {
        await stopApiInstance();
      } catch (err) {
        console.error(`[dev-api] ${err.message}`);
        shutdown(1);
        return;
      }
      if (shuttingDown) {
        return;
      }
      startApiInstance();
    } while (apiRestartPending);
  } finally {
    apiRestartInFlight = false;
  }
}

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  cancelScheduledRestart();
  if (contractsCascadeTimer) {
    clearTimeout(contractsCascadeTimer);
    contractsCascadeTimer = null;
  }

  const targets = [...children];
  if (apiChild && apiChild.pid !== null && apiChild.pid !== undefined) {
    targets.push(apiChild);
  }

  if (targets.length === 0) {
    process.exit(exitCode);
    return;
  }

  console.log('\n[dev-api] encerrando processos filhos...');
  let pending = targets.length;

  const done = () => {
    pending -= 1;
    if (pending <= 0) {
      process.exit(exitCode);
    }
  };

  for (const child of targets) {
    if (child.pid === null || child.pid === undefined) {
      done();
      continue;
    }
    treeKill(child.pid, 'SIGTERM', () => done());
  }

  // Rede de segurança: garante que o processo principal não fique pendurado
  // caso algum filho não responda ao sinal de encerramento.
  setTimeout(() => process.exit(exitCode), 5000).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  // Um único build inicial síncrono: `pnpm --filter api build` já dispara o
  // `prebuild` da API, que constrói `@commerce-platform/contracts` antes de
  // rodar `nest build`.
  await runStep('build inicial (contracts via prebuild + api)', 'pnpm', ['--filter', 'api', 'build']);

  console.log('[dev-api] artefatos iniciais prontos. Iniciando contracts:watch...\n');
  const contractsWatch = spawnWatcher(
    'contracts:watch',
    'node',
    [tscBinPath(CONTRACTS_DIR), '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'],
    { cwd: CONTRACTS_DIR },
  );
  await attachWatcherLifecycle('contracts', 'contracts:watch', contractsWatch, READY_TIMEOUT_MS);

  console.log('[dev-api] contracts:watch compilou sem erros. Iniciando api:watch...\n');
  const apiWatch = spawnWatcher(
    'api:watch',
    'node',
    [tscBinPath(API_DIR), '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'],
    { cwd: API_DIR },
  );
  await attachWatcherLifecycle('api', 'api:watch', apiWatch, READY_TIMEOUT_MS);

  console.log('[dev-api] api:watch compilou sem erros. Iniciando a API...\n');
  startApiInstance();
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[dev-api] ${message}`);
  shutdown(1);
});
