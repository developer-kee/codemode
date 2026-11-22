// Usage: npm run add -- <name> <command> [args...]      e.g.  npm run add -- linear npx -y some-mcp
//        npm run add -- <name> --url <https://...>
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [name, ...rest] = process.argv.slice(2);
if (!name || !/^[a-z0-9_-]+$/i.test(name) || rest.length === 0) {
  console.error('Usage: npm run add -- <name> <command> [args...] | --url <url>');
  process.exit(1);
}
const file = fileURLToPath(new URL(`../services/${name}.js`, import.meta.url));
if (existsSync(file)) { console.error(`services/${name}.js already exists`); process.exit(1); }
const upstream = rest[0] === '--url' ? { url: rest[1] } : { command: rest[0], args: rest.slice(1) };
writeFileSync(file, `export default {\n  name: ${JSON.stringify(name)},\n  upstream: ${JSON.stringify(upstream)},\n};\n`);
console.log(`Created services/${name}.js\nRegister: claude mcp add codemode-${name} -- node ${fileURLToPath(new URL('../src/cli.js', import.meta.url))} ${name}`);
