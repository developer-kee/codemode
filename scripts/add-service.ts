// Usage: npm run add -- <name> <command> [args...]      e.g.  npm run add -- linear npx -y some-mcp
//        npm run add -- <name> --url <https://...>
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Upstream } from '../src/types.ts';

const [name, first, ...rest] = process.argv.slice(2);
if (name === undefined || !/^[a-z0-9_-]+$/i.test(name) || first === undefined) {
  console.error('Usage: npm run add -- <name> <command> [args...] | --url <url>');
  process.exit(1);
}
const file = fileURLToPath(new URL(`../services/${name}.ts`, import.meta.url));
if (existsSync(file)) {
  console.error(`services/${name}.ts already exists`);
  process.exit(1);
}
const url = rest[0];
if (first === '--url' && url === undefined) {
  console.error('--url needs a value');
  process.exit(1);
}
const upstream: Upstream = first === '--url' ? { url: url ?? '' } : { command: first, args: rest };

writeFileSync(
  file,
  `import type { ServiceConfig } from '../src/types.ts';

export default {
  name: ${JSON.stringify(name)},
  upstream: ${JSON.stringify(upstream)},
} satisfies ServiceConfig;
`,
);
console.log(
  `Created services/${name}.ts\nRegister: claude mcp add codemode-${name} -- node ${fileURLToPath(new URL('../src/cli.ts', import.meta.url))} ${name}`,
);
