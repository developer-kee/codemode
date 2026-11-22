// Usage: npm run login -- <service>
// One-time browser sign-in for a service whose upstream uses OAuth (`upstream.oauth` in its service file).
// Tokens are saved in your user profile, not in the repo; run it again if the sign-in expires.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { login } from '../src/oauth.ts';
import { listServices, servicePath } from '../src/services.ts';
import type { ServiceConfig } from '../src/types.ts';

const dir = fileURLToPath(new URL('../services/', import.meta.url));
const service = process.argv[2];
const available = listServices(dir);
if (service === undefined || !available.includes(service)) {
  console.error(`Usage: npm run login -- <service>\nServices: ${available.join(', ')}`);
  process.exit(1);
}

const config = ((await import(pathToFileURL(`${servicePath(dir, service)}.ts`).href)) as { default?: ServiceConfig }).default;
if (!config || !('url' in config.upstream) || !config.upstream.oauth) {
  console.error(`${service} does not use OAuth (its service file has no upstream.oauth), so there is nothing to sign in to.`);
  process.exit(1);
}

try {
  const tools = await login({ service: config.upstream.oauth.service, serverUrl: config.upstream.url });
  console.log(`Signed in to ${service}: the server offers ${tools} tools. Next: node src/cli.ts ${service} --update-lock`);
} catch (e) {
  console.error(`Sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
