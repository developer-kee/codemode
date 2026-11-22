// Every service has its own folder in `services/`:
//   services/blender/index.ts           the service `blender`
//   services/notion/token.ts            the service `notion/token` (a folder can hold several related services)
// The lock file sits beside the service file (`index.lock.json`, `token.lock.json`). A service is addressed by its
// folder, plus the file name when it is not `index`, everywhere: the CLI, the lock scripts and the benchmark.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Letters, digits, `_` and `-`, joined by single `/`: no `..`, no leading `/`, so a name cannot leave `services/`. */
export const SERVICE_NAME = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/i;

/** Every service under `dir`, as sorted names with `/` separators. */
export function listServices(dir: string, prefix = ''): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) names.push(...listServices(join(dir, entry.name), `${prefix}${entry.name}/`));
    else if (entry.name === 'index.ts' && prefix !== '') names.push(prefix.slice(0, -1));
    else if (entry.name.endsWith('.ts') && prefix !== '') names.push(`${prefix}${entry.name.slice(0, -3)}`);
  }
  return names.sort();
}

/** The service file for `name` without its extension (`<dir>blender/index`, `<dir>notion/token`); add `.ts` or `.lock.json`. */
export function servicePath(dir: string, name: string): string {
  return existsSync(`${dir}${name}.ts`) ? `${dir}${name}` : `${dir}${name}/index`;
}
