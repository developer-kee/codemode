import { callsVariant } from '../../lib/calls/index.ts';
import type { BenchService, BenchVariant } from '../../lib/types.ts';
import { playwrightCalls } from './cases.ts';
import { ORIGIN, startFixture } from './fixture.ts';
import { tasks } from './tasks.ts';

/** Launch flags shared by both paths so they expose the same browser, confined to the local fixture site. */
const FLAGS = ['--browser', 'msedge', '--headless', '--allowed-origins', ORIGIN];

let stopFixture: (() => Promise<void>) | undefined;

const scenarios: BenchVariant = {
  id: 'scenarios',
  title: 'multi-step scenario tasks',
  direct: {
    server: 'playwright',
    command: 'npx',
    args: ['-y', '@playwright/mcp@0.0.86', '--isolated', ...FLAGS],
  },
  codemodeEnv: { CODEMODE_PLAYWRIGHT_ARGS: FLAGS.join(' ') },
  systemPrompt:
    'You control a web browser through the tools provided. Only visit the local test site named in the task. Complete the task, then reply with one short sentence.',
  notes: ['Both paths expose the same 25 tools of the pinned `@playwright/mcp@0.0.86`.'],
  tasks,
};

export const playwright: BenchService = {
  id: 'playwright',
  title: 'Playwright (browser, local test site)',
  warning:
    `Drives a real headless Microsoft Edge (already installed; nothing is downloaded) against a small local site on ${ORIGIN}, ` +
    'and the browser is limited to that origin with --allowed-origins. The server also exposes browser_run_code_unsafe, which runs ' +
    'arbitrary Playwright code on this PC, and nothing here removes it. Needs port 4817 free. Edge must be installed.',
  notes: [
    'Both paths launch the same pinned `@playwright/mcp@0.0.86` (headless Edge, isolated profile, restricted to the local fixture origin) and see the same 25 tools; the browser starts fresh for every run.',
    'Tasks run against a deterministic local website (150-row catalog, a form, a 6-page ratings list), so results do not depend on the internet.',
    'The ratings list has exactly one item rated 5.0: decoy ratings are capped at 4.9, so the top-rated task has a single correct answer.',
    'Pass/fail comes from the fixture itself: the form task checks what the server received; the other tasks check the answer against values computed from the fixture data.',
    'Unlike Blender and Windows, these tasks return large page snapshots (the catalog is one big table), so they exercise filtering big tool results in code, which is the case Code Mode is designed for.',
  ],
  defaultVariant: 'scenarios',
  variants: [scenarios, callsVariant(scenarios, playwrightCalls)],
  calls: playwrightCalls,
  async preflight() {
    stopFixture = await startFixture();
    process.on('exit', () => void stopFixture?.());
  },
};
