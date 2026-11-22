#!/usr/bin/env node
// Usage: node src/cli.js <service>   (service = a file in services/)
//        node src/cli.js --list
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runCodeModeServer } from './server.js';

const dir = fileURLToPath(new URL('../services/', import.meta.url));
const available = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
const arg = process.argv[2];

if (!arg || arg === '--list') {
  console.error(`Services: ${available.join(', ') || '(none)'}\nUsage: node src/cli.js <service>`);
  process.exit(arg ? 0 : 1);
}
if (!/^[a-z0-9_-]+$/i.test(arg) || !available.includes(arg)) {
  console.error(`Unknown service "${arg}". Available: ${available.join(', ')}`);
  process.exit(1);
}
const { default: config } = await import(pathToFileURL(`${dir}${arg}.js`).href);
await runCodeModeServer({ ...config, name: `codemode-${config.name ?? arg}` });
