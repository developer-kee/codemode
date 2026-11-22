import { fileURLToPath } from 'node:url';
import { FileOAuthProvider } from '../../../src/oauth.ts';
import { callsVariant } from '../../lib/calls/index.ts';
import type { BenchService, BenchVariant } from '../../lib/types/index.ts';
import { notionOauthCalls } from './cases.ts';

const SERVER_URL = 'https://mcp.notion.com/mcp';

const base: BenchVariant = {
  id: 'reads',
  title: 'read-only tools',
  direct: { server: 'notion-oauth', command: process.execPath, args: [fileURLToPath(new URL('./bridge.ts', import.meta.url))] },
  systemPrompt: 'You work in a Notion workspace through the tools provided. Complete the task, then reply with one short sentence.',
  notes: [
    "Both paths expose the same 39 read-only tools of Notion's hosted server (`readOnlyHint: true`). The server also has 38 write tools, which neither path offers.",
    'The "direct" path is a pass-through stdio bridge (`bench/suites/notion-oauth/bridge.ts`) that uses the same saved sign-in, because the hosted server needs OAuth and the harness starts stdio servers.',
    "Only definition cost and one-call latency are measured. There are no model-driven tasks: the workspace is the signed-in user's own, so there is no seed data to check an answer against, and the report must not contain workspace content.",
  ],
  tasks: [],
};

export const notionOauth: BenchService = {
  id: 'notion-oauth',
  wrapper: 'notion/oauth',
  title: 'Notion (hosted MCP server, OAuth, read-only)',
  warning:
    'READS the signed-in Notion account (listing and searching pages, users, teams, calendars). It writes nothing. ' +
    'Needs `npm run login -- notion/oauth` first. Results hold sizes and timings only, never page or user content, but the calls themselves do read your workspace.',
  notes: ['Latency includes the network round trip to Notion, which varies far more than a local server; read the spread (p95), not one median.'],
  defaultVariant: 'calls',
  variants: [callsVariant(base, notionOauthCalls)],
  calls: notionOauthCalls,
  async preflight() {
    if (!new FileOAuthProvider({ service: 'notion-oauth', serverUrl: SERVER_URL }).tokens()) {
      throw new Error('Not signed in to Notion. Run: npm run login -- notion/oauth');
    }
  },
};
