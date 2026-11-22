// How services launch their upstream MCP servers: from what `npm run servers:install` put in this folder, which
// comes from package-lock.json and uv.lock (exact versions, every dependency, integrity hashes), instead of letting
// `npx -y` or `uvx` resolve whatever is newest on every start.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
export const PYTHON_PROJECT = join(here, 'python');

interface Launch {
  command: string;
  args: string[];
}

/** A launch that explains itself, so a missing install fails with a hint instead of "Cannot find module". */
function notInstalled(what: string): Launch {
  const message = `${what} is not installed. Run: npm run servers:install`;
  return { command: process.execPath, args: ['-e', `console.error(${JSON.stringify(message)}); process.exit(1)`] };
}

/** Run an npm package's first `bin` with Node, from servers/node_modules. */
export function npmServer(pkg: string, ...args: string[]): Launch {
  const manifest = join(here, 'node_modules', ...pkg.split('/'), 'package.json');
  if (!existsSync(manifest)) return notInstalled(pkg);
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: string | Record<string, string> };
  const rel = typeof bin === 'string' ? bin : Object.values(bin ?? {})[0];
  if (!rel) return notInstalled(`${pkg} (it declares no executable)`);
  return { command: process.execPath, args: [join(manifest, '..', rel), ...args] };
}

/** Run a console script from the locked Python environment. `--frozen` never touches uv.lock. */
export function pythonServer(script: string, ...args: string[]): Launch {
  return { command: 'uv', args: ['run', '--frozen', '--project', PYTHON_PROJECT, script, ...args] };
}
