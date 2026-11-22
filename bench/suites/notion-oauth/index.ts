import { fileURLToPath } from 'node:url';
import { FileOAuthProvider } from '../../../src/oauth.ts';
import { connectUpstream } from '../../../src/upstream.ts';
import { callsVariant } from '../../lib/calls/index.ts';
import type { BenchService, BenchVariant } from '../../lib/types/index.ts';
import { tasks as tokenSuiteTasks } from '../notion/tasks.ts';
import { notionOauthCalls } from './cases.ts';
import { seedViaOAuth } from './seed.ts';

const SERVER_URL = 'https://mcp.notion.com/mcp';

/** The two read-only scenarios of the self-hosted Notion suite: same prompts, same seeded data, same answers. */
const readTasks = tokenSuiteTasks.filter((t) => ['status-count', 'owner-load'].includes(t.id));

const base: BenchVariant = {
  id: 'reads',
  title: 'read-only tools',
  direct: { server: 'notion-oauth', command: process.execPath, args: [fileURLToPath(new URL('./bridge.ts', import.meta.url))] },
  systemPrompt:
    'You work in a Notion workspace through the tools provided. Use only the page and database named in the task. Complete the task, then reply with one short sentence.',
  notes: [
    "Both paths expose all 77 tools of Notion's hosted server, write tools included, which is the wrapper's default. The scenario tasks only read.",
    'The "direct" path is a pass-through stdio bridge (`bench/suites/notion-oauth/bridge.ts`) that uses the same saved sign-in, because the hosted server needs OAuth and the harness starts stdio servers.',
  ],
  tasks: [],
};

const scenarios: BenchVariant = {
  ...base,
  id: 'scenarios',
  title: 'multi-step read-only scenario tasks',
  notes: [
    ...base.notes,
    '`status-count` and `owner-load` are the same tasks, on the same seeded 40-row database, as the self-hosted Notion suite, so the two Notion servers can be compared on identical work. `write-summary` is left out: this wrapper cannot write.',
    'Partway through the runs Notion reported that the account\'s "Query Data Source" allowance was used up, and both paths fell back to reading the database page instead. That is an account limit, not the wrapper, and it makes later runs take more turns on both sides; repeat on a fresh allowance for cleaner numbers.',
    'One early codemode `status-count` run is recorded as failed only because the model wrote "Seven" instead of "7". The check now accepts numbers written as words; the record is left as it was run.',
    "The data is seeded through the hosted server itself (no integration token), then the model reads it with the server's own search and fetch tools. The report holds task prompts, token counts and pass/fail only, not workspace content.",
  ],
  tasks: readTasks,
};

const callsOnly: BenchVariant = {
  ...base,
  notes: [
    ...base.notes,
    "Per-call cases need no seed data and have no model prompt: they record sizes and timings only, against the signed-in user's own workspace, so the report cannot contain workspace content.",
  ],
};

/** Notion's search index lags behind writes; the model finds the seeded database through search, so wait for it. */
async function waitUntilSearchable(): Promise<void> {
  const client = await connectUpstream({ url: SERVER_URL, oauth: { service: 'notion-oauth' } });
  try {
    for (let i = 0; i < 36; i++) {
      const res = await client.callTool({ name: 'notion-search', arguments: { query: 'Bench Tasks', page_size: 5 } });
      const text = JSON.stringify(res.content);
      if (res.isError !== true && text.includes('Bench Tasks')) return;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    console.warn('The seeded database is not in Notion search after 3 minutes; the model may not find it.');
  } finally {
    await client.close();
  }
}

export const notionOauth: BenchService = {
  id: 'notion-oauth',
  wrapper: 'notion/oauth',
  title: 'Notion (hosted MCP server, OAuth)',
  warning:
    'Needs `npm run login -- notion/oauth` first. The per-call cases only READ the signed-in account. The `scenarios` variant WRITES: it creates a private top-level ' +
    '"codemode bench <timestamp>" page with a 40-row database and moves older "codemode bench" pages to the trash (matched by that exact title prefix). ' +
    'The wrapper has its write tools on in this benchmark, so a model could change other pages; the scenario tasks only read. Use a test workspace if you can. ' +
    'Models can search the whole account, so they may read other pages while looking; nothing they read is saved in the results.',
  notes: ['Latency includes the network round trip to Notion, which varies far more than a local server; read the spread (p95), not one median.'],
  defaultVariant: 'scenarios',
  variants: [scenarios, callsVariant(callsOnly, notionOauthCalls)],
  calls: notionOauthCalls,
  async preflight() {
    if (!new FileOAuthProvider({ service: 'notion-oauth', serverUrl: SERVER_URL }).tokens()) {
      throw new Error('Not signed in to Notion. Run: npm run login -- notion/oauth');
    }
    // Only a model run (`npm run bench`) needs seed data; `bench:calls` and the report work without it.
    const modelRun = (process.argv[1] ?? '').replaceAll('\\', '/').endsWith('bench/cli/run.ts');
    if (modelRun) {
      await seedViaOAuth();
      await waitUntilSearchable();
    }
  },
};
