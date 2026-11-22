#!/usr/bin/env node
// Usage: node src/cli.ts <service> [--read-only]   (service = a file in services/; or set CODEMODE_READ_ONLY=1)
//        node src/cli.ts --list
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runCodeModeServer } from './server.ts';
import type { ServiceConfig } from './types.ts';

const dir = fileURLToPath(new URL('../services/', import.meta.url));
const available = readdirSync(dir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => f.slice(0, -3));
const args = process.argv.slice(2);
const readOnly = args.includes('--read-only') || ['1', 'true'].includes(process.env['CODEMODE_READ_ONLY'] ?? '');
const arg = args.find((a) => a !== '--read-only');

if (arg === undefined || arg === '--list') {
  console.error(`Services: ${available.join(', ') || '(none)'}\nUsage: node src/cli.ts <service>`);
  process.exit(arg === undefined ? 1 : 0);
}
if (!/^[a-z0-9_-]+$/i.test(arg) || !available.includes(arg)) {
  console.error(`Unknown service "${arg}". Available: ${available.join(', ')}`);
  process.exit(1);
}

const mod = (await import(pathToFileURL(`${dir}${arg}.ts`).href)) as { default?: ServiceConfig };
const config = mod.default;
if (!config?.upstream) {
  console.error(`services/${arg}.ts must default-export a ServiceConfig`);
  process.exit(1);
}
const access = readOnly ? { ...config.access, readOnly: true } : config.access;
await runCodeModeServer({ ...config, name: `codemode-${config.name || arg}`, ...(access ? { access } : {}) });
