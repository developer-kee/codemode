import type { ServiceConfig } from '../src/types.ts';

// Browser automation via https://github.com/microsoft/playwright-mcp (npm: @playwright/mcp), pinned for reproducible
// results. Defaults to an isolated (in-memory) profile.
//
// The model can drive a real browser and, through `browser_run_code_unsafe`, run arbitrary Playwright code on this
// machine. Confine it: CODEMODE_PLAYWRIGHT_ARGS appends flags, e.g.
//   CODEMODE_PLAYWRIGHT_ARGS="--browser msedge --headless --allowed-origins http://127.0.0.1:4817"
const extra = (process.env['CODEMODE_PLAYWRIGHT_ARGS'] ?? '').split(/\s+/).filter((a) => a.length > 0);

export default {
  name: 'playwright',
  upstream: { command: 'npx', args: ['-y', '@playwright/mcp@0.0.86', '--isolated', ...extra] },
} satisfies ServiceConfig;
