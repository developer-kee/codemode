#!/usr/bin/env node
// Usage: node src/cli.ts <service> [--read-only] [--update-lock]
//        node src/cli.ts --list
//
// <service> is a folder in services/ (`blender`), or a file in one (`notion/oauth`). Environment:
//   CODEMODE_READ_ONLY=1       same as --read-only
//   CODEMODE_LOCK=enforce|warn|off|update   tool-definition lock mode (default enforce; --update-lock = update)
//   CODEMODE_REQUIRE_LOCK=1    refuse to start when the service's lock file is missing
//   CODEMODE_AUDIT=<file>      append a redacted audit trail (no code, arguments or results) to this file
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runCodeModeServer } from './server.ts';
import { listServices, SERVICE_NAME, servicePath } from './services.ts';
import type { LockMode } from './toollock.ts';
import type { ServiceConfig } from './types.ts';

const dir = fileURLToPath(new URL('../services/', import.meta.url));
const available = listServices(dir);
const FLAGS = new Set(['--read-only', '--update-lock']);
const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const arg = args.find((a) => !FLAGS.has(a));

if (arg === undefined || arg === '--list') {
  console.error(`Services: ${available.join(', ') || '(none)'}\nUsage: node src/cli.ts <service> [--read-only] [--update-lock]`);
  process.exit(arg === undefined ? 1 : 0);
}
if (!SERVICE_NAME.test(arg) || !available.includes(arg)) {
  console.error(`Unknown service "${arg}". Available: ${available.join(', ')}`);
  process.exit(1);
}

const mod = (await import(pathToFileURL(`${servicePath(dir, arg)}.ts`).href)) as { default?: ServiceConfig };
const config = mod.default;
if (!config?.upstream) {
  console.error(`services/${arg} must default-export a ServiceConfig`);
  process.exit(1);
}

const readOnly = flag('--read-only') || ['1', 'true'].includes(process.env['CODEMODE_READ_ONLY'] ?? '');
const access = readOnly ? { ...config.access, readOnly: true } : config.access;

const requested = flag('--update-lock') ? 'update' : (process.env['CODEMODE_LOCK'] ?? 'enforce');
if (!['enforce', 'warn', 'off', 'update'].includes(requested)) {
  console.error(`CODEMODE_LOCK must be enforce, warn, off or update (got "${requested}")`);
  process.exit(1);
}
const lock = {
  path: `${servicePath(dir, arg)}.lock.json`,
  mode: requested as LockMode,
  require: ['1', 'true'].includes(process.env['CODEMODE_REQUIRE_LOCK'] ?? ''),
};
const auditFile = process.env['CODEMODE_AUDIT'];

try {
  await runCodeModeServer({
    ...config,
    name: `codemode-${config.name || arg}`,
    ...(access ? { access } : {}),
    lock,
    ...(auditFile ? { auditFile } : {}),
  });
} catch (e) {
  console.error(`[codemode] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
