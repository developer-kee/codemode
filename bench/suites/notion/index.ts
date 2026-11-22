import { callsVariant } from '../../lib/calls/index.ts';
import type { BenchService, BenchVariant } from '../../lib/types/index.ts';
import { notionCalls } from './cases.ts';
import { parentPageId, seedWorkspace } from './fixture.ts';
import { tasks } from './tasks.ts';

/** `${NOTION_TOKEN}` is expanded from the environment, so the token is never written to a config file. */
const env = { NOTION_TOKEN: '${NOTION_TOKEN}' };

const scenarios: BenchVariant = {
  id: 'scenarios',
  title: 'multi-step scenario tasks',
  direct: { server: 'notion', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server@2.6.1'], env },
  codemodeEnv: env,
  systemPrompt:
    'You work in a Notion workspace through the tools provided. Use only the page and database named in the task. Complete the task, then reply with one short sentence.',
  notes: [
    'Both paths expose all 23 tools of the pinned `@notionhq/notion-mcp-server@2.6.1`, whose definitions are about 76,000 characters, the largest of any service benchmarked here.',
    '`status-count` and `owner-load` read all 40 tasks and aggregate them; `write-summary` writes a page that is then read back through the REST API.',
    'The Claude Code runner expands `${NOTION_TOKEN}` itself; other runners may not, so Notion results are only comparable across runs of the same runner.',
  ],
  tasks,
};

export const notion: BenchService = {
  id: 'notion',
  title: 'Notion (official MCP server)',
  warning:
    'WRITES to a real Notion workspace. Needs NOTION_TOKEN (an internal integration token) and NOTION_BENCH_PAGE_ID (a page shared with that integration). ' +
    'It creates a "codemode bench <timestamp>" page with a 40-row database under that page (about 15 s), trashes older "codemode bench" pages there, ' +
    'and lets the model create a "Summary" page. It touches nothing outside that page. Use a test workspace. ' +
    'UNTESTED against live Notion: the seeding code follows the API documentation but has never run.',
  notes: [
    'Pass/fail comes from values computed from the seed data, or from reading the created page back through the Notion REST API, not from the model\'s claim.',
    'The seeded database is created once per benchmark run, so write tasks are reset by trashing the page they create.',
  ],
  defaultVariant: 'scenarios',
  variants: [scenarios, callsVariant(scenarios, notionCalls)],
  calls: notionCalls,
  async preflight() {
    parentPageId(); // fails early with instructions when the environment is not set up
    if (!process.env['NOTION_TOKEN']) throw new Error('NOTION_TOKEN is not set (see the warning above).');
    await seedWorkspace();
  },
};
