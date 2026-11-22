// Services live in `services/`, either as `services/<name>.ts` or grouped in a folder: `services/<group>/<name>.ts`.
// A service is addressed by its path without the extension (`blender`, `notion/oauth`) everywhere: the CLI, the lock
// scripts and the benchmark.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Letters, digits, `_` and `-`, joined by single `/`: no `..`, no leading `/`, so a name cannot leave `services/`. */
export const SERVICE_NAME = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/i;

/** Every service under `dir`, as sorted names with `/` separators. */
export function listServices(dir: string, prefix = ''): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) names.push(...listServices(join(dir, entry.name), `${prefix}${entry.name}/`));
    else if (entry.name.endsWith('.ts')) names.push(`${prefix}${entry.name.slice(0, -3)}`);
  }
  return names.sort();
}
