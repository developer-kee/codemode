// Usage: npm run lock:update [-- <service> ...]     write the locks
//        npm run lock:verify [-- <service> ...]     check that each service still starts under its committed lock
// Starts each service once with --update-lock so services/<service>.lock.json records exactly what its upstream
// offers. Run it after you have READ what changed (git diff the lock files); the lock exists to make changes visible.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readLock } from '../src/toollock.ts';
import { connectUpstream } from '../src/upstream.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const all = readdirSync(`${root}services`)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => f.slice(0, -3));
const verify = process.argv.includes('--verify');
const wanted = process.argv.slice(2).filter((a) => a !== '--verify');
const targets = wanted.length > 0 ? wanted : all;
const unknown = targets.filter((t) => !all.includes(t));
if (unknown.length > 0) {
  console.error(`Unknown service(s): ${unknown.join(', ')}. Available: ${all.join(', ')}`);
  process.exit(1);
}

let failed = 0;
for (const service of targets) {
  try {
    // Listing tools needs no real credentials, only a value so the upstream starts. Locks are written for the full,
    // unrestricted tool set: a restricted variant is checked against it and may only offer fewer tools.
    const client = await connectUpstream({
      command: process.execPath,
      args: [`${root}src/cli.ts`, service, ...(verify ? [] : ['--update-lock'])],
      env: { NOTION_TOKEN: process.env['NOTION_TOKEN'] ?? 'ntn_placeholder_for_listing_tools_only' },
    });
    await client.listTools();
    await client.close();
    const locked = Object.keys(readLock(`${root}services/${service}.lock.json`)?.tools ?? {}).length;
    console.log(verify ? `${service}: starts under its lock (${locked} tools)` : `${service}: ${locked} upstream tools locked`);
  } catch (e) {
    failed++;
    console.error(`${service}: failed (${e instanceof Error ? e.message : String(e)})`);
  }
}
process.exit(failed > 0 ? 1 : 0);
