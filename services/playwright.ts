import type { ServiceConfig } from '../src/types.ts';

// Browser automation via https://github.com/microsoft/playwright-mcp (npm: @playwright/mcp), pinned for reproducible
// results. Defaults to an isolated (in-memory) profile.
//
// The model can drive a real browser. `browser_run_code_unsafe` runs arbitrary Playwright code on this machine, so it is
// left out unless CODEMODE_ALLOW_UNSAFE=1. Confine the browser too: CODEMODE_PLAYWRIGHT_ARGS appends flags, e.g.
//   CODEMODE_PLAYWRIGHT_ARGS="--browser msedge --headless --allowed-origins http://127.0.0.1:4817"
const extra = (process.env['CODEMODE_PLAYWRIGHT_ARGS'] ?? '').split(/\s+/).filter((a) => a.length > 0);

const allowUnsafe = process.env['CODEMODE_ALLOW_UNSAFE'] === '1';

export default {
  name: 'playwright',
  // Untrusted web pages and outbound requests; the isolated profile holds no private data. Add it if you log in.
  capabilities: { privateData: false, untrustedContent: true, externalComms: true },
  upstream: { command: 'npx', args: ['-y', '@playwright/mcp@0.0.86', '--isolated', ...extra] },
  ...(allowUnsafe ? {} : { access: { deny: ['browser_run_code_unsafe'] } }),
} satisfies ServiceConfig;
