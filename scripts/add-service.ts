// `linear` creates services/linear/index.ts; a grouped name such as `notion/oauth` creates services/notion/oauth.ts.
// Usage: npm run add -- <name> <command> [args...]      e.g.  npm run add -- linear npx -y some-mcp
//        npm run add -- <name> --url <https://...>
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICE_NAME } from '../src/services.ts';
import type { Upstream } from '../src/types.ts';

const [name, first, ...rest] = process.argv.slice(2);
if (name === undefined || !SERVICE_NAME.test(name) || first === undefined) {
  console.error('Usage: npm run add -- <name> <command> [args...] | --url <url>');
  process.exit(1);
}
const rel = name.includes('/') ? `${name}.ts` : `${name}/index.ts`;
const file = fileURLToPath(new URL(`../services/${rel}`, import.meta.url));
if (existsSync(file)) {
  console.error(`services/${rel} already exists`);
  process.exit(1);
}
const url = rest[0];
if (first === '--url' && url === undefined) {
  console.error('--url needs a value');
  process.exit(1);
}
const upstream: Upstream = first === '--url' ? { url: url ?? '' } : { command: first, args: rest };

mkdirSync(dirname(file), { recursive: true });
const up = '../'.repeat(rel.split('/').length);
writeFileSync(
  file,
  `import type { ServiceConfig } from '${up}src/types.ts';

export default {
  name: ${JSON.stringify(name.replaceAll('/', '-'))},
  upstream: ${JSON.stringify(upstream)},
} satisfies ServiceConfig;
`,
);
console.log(
  `Created services/${rel}\nRegister: claude mcp add codemode-${name.replaceAll('/', '-')} -- node ${fileURLToPath(new URL('../src/cli.ts', import.meta.url))} ${name}`,
);
