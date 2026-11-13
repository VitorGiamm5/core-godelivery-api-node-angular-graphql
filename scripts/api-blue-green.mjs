#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envPath = resolve(root, '.env');
const [command, target, ...extra] = process.argv.slice(2);
const usage = 'Uso: node scripts/api-blue-green.mjs <deploy|switch> <blue|green>';

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!['deploy', 'switch'].includes(command) || !['blue', 'green'].includes(target) || extra.length) fail(usage);

let envFile;
try {
  envFile = readFileSync(envPath, 'utf8');
} catch {
  fail('Arquivo .env não encontrado. Copie .env.example, preencha os segredos locais e tente novamente.');
}

function readEnv(name, fallback) {
  const line = envFile.split(/\r?\n/).find(value => value.trimStart().startsWith(`${name}=`));
  if (!line) return fallback;
  const value = line.slice(line.indexOf('=') + 1).trim();
  return value.replace(/^(?:"(.*)"|'(.*)')$/, (_match, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
}

function compose(args) {
  const env = { ...process.env };
  delete env.API_ACTIVE_SLOT;
  const result = spawnSync('docker', ['compose', ...args], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw new Error(`Não foi possível executar Docker Compose: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Docker Compose terminou com código ${result.status ?? 'desconhecido'}.`);
}

function composeOrFail(args) {
  try {
    compose(args);
  } catch (error) {
    fail(error.message);
  }
}

function composeOutput(args) {
  const env = { ...process.env };
  delete env.API_ACTIVE_SLOT;
  const result = spawnSync('docker', ['compose', ...args], { cwd: root, env, encoding: 'utf8' });
  if (result.error) fail(`Não foi possível consultar Docker Compose: ${result.error.message}`);
  if (result.status !== 0) fail(`Docker Compose terminou com código ${result.status ?? 'desconhecido'}.`);
  return result.stdout.trim();
}

function tryComposeOutput(args) {
  const env = { ...process.env };
  delete env.API_ACTIVE_SLOT;
  const result = spawnSync('docker', ['compose', ...args], { cwd: root, env, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

function readActiveSlot() {
  const runningGateway = tryComposeOutput(['ps', '--status', 'running', '-q', 'web']);
  if (runningGateway) {
    const slot = tryComposeOutput(['exec', '-T', 'web', 'cat', '/var/lib/gateway/active-slot']);
    if (slot === 'blue' || slot === 'green') return slot;
  }

  const slot = tryComposeOutput([
    'run', '--rm', '--no-deps', '--no-build', '--pull', 'never', '--entrypoint', '/bin/sh', 'web',
    '-c', 'if [ -s /var/lib/gateway/active-slot ]; then cat /var/lib/gateway/active-slot; else printf "%s" "${API_ACTIVE_SLOT:-blue}"; fi',
  ]);
  if (slot === 'blue' || slot === 'green') return slot;
  return readEnv('API_ACTIVE_SLOT', 'blue');
}

function routeGatewayTo(slot) {
  const gatewayContainer = composeOutput(['ps', '--status', 'running', '-q', 'web']);
  if (!gatewayContainer) compose(['up', '--detach', '--no-deps', '--build', 'web']);
  compose(['exec', '-T', 'web', '/bin/sh', '/usr/local/bin/select-api-slot', slot]);
}

async function gatewayReady() {
  const configuredPort = process.env.WEB_HOST_PORT ?? readEnv('WEB_HOST_PORT', '9100');
  if (!/^\d+$/.test(configuredPort)) fail('WEB_HOST_PORT precisa ser uma porta numérica.');
  const endpoint = `http://127.0.0.1:${configuredPort}/health/ready`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return true;
    } catch {
      // O Nginx pode iniciar antes de o novo destino ficar disponível.
    }
    await delay(500);
  }
  return false;
}

const previousSlot = readActiveSlot();
if (!['blue', 'green'].includes(previousSlot)) fail('API_ACTIVE_SLOT deve ser blue ou green no arquivo .env.');
if (target === previousSlot) {
  if (command === 'deploy') fail(`O slot ${target} já está ativo; faça deploy no slot inativo.`);
  console.log(`O slot ${target} já está ativo.`);
  process.exit(0);
}

console.log(command === 'deploy'
  ? `Construindo e aguardando a prontidão do slot ${target}...`
  : `Aguardando a prontidão do slot ${target}...`);
composeOrFail([
  'up', '--detach', ...(command === 'deploy' ? ['--build'] : ['--no-deps', '--no-build', '--pull', 'never']),
  '--wait', `api-${target}`,
]);
console.log('Confirmando os dois slots saudáveis antes da troca...');
composeOrFail(['up', '--detach', '--wait', 'api-blue', 'api-green']);

try {
  console.log('Atualizando o gateway sem mudar o slot ativo...');
  compose(['up', '--detach', '--no-deps', '--build', 'web']);
  console.log(`Recarregando o gateway para direcionar tráfego a ${target}...`);
  routeGatewayTo(target);
  if (!await gatewayReady()) throw new Error('O gateway não respondeu com readiness dentro do prazo.');
} catch (error) {
  console.error(`A troca para ${target} falhou: ${error.message}`);
  console.error(`Restaurando o slot anterior ${previousSlot}...`);
  try {
    routeGatewayTo(previousSlot);
    if (!await gatewayReady()) throw new Error('O gateway anterior também não respondeu com readiness.');
    console.error(`Gateway restaurado para ${previousSlot}; ambos os slots foram mantidos.`);
  } catch (rollbackError) {
    console.error(`Não foi possível confirmar o rollback: ${rollbackError.message}`);
    process.exitCode = 1;
  }
  process.exit(1);
}

console.log(`Gateway pronto com o slot ${target}. O slot ${previousSlot} continua disponível para rollback.`);
console.log('Removendo serviços antigos que não fazem mais parte do Compose...');
try {
  compose(['up', '--detach', '--remove-orphans']);
} catch (error) {
  console.error(`O gateway está ativo em ${target}, mas a limpeza de serviços antigos falhou: ${error.message}`);
  process.exitCode = 1;
}
