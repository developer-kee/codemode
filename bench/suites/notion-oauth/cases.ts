import type { CallDef } from '../../lib/types/index.ts';

// Notion's hosted server, read-only tools only, against whatever workspace is signed in. There is no seed data and no
// model prompt: the benchmark records sizes and timings, never what the workspace contains, and the arguments below
// are generic (no titles, ids or names). That is also why there are no model-driven tasks here: with no known
// content there is nothing objective to check an answer against.
const limit = { limit: 5 };

export const notionOauthCalls: CallDef = {
  async reset() {
    // Read-only: nothing to put back.
  },
  cases: [
    { id: 'notion-get-self', tool: 'notion-get-self', args: {} },
    { id: 'notion-get-users', tool: 'notion-get-users', args: { page_size: 5 } },
    { id: 'notion-get-teams', tool: 'notion-get-teams', args: {} },
    { id: 'notion-get-groups', tool: 'notion-get-groups', args: {} },
    { id: 'notion-get-tool-access', tool: 'notion-get-tool-access', args: {} },
    { id: 'notion-get-enabled-skills', tool: 'notion-get-enabled-skills', args: {} },
    { id: 'notion-get-setup-guide', tool: 'notion-get-setup-guide', args: {} },
    { id: 'notion-get-sidebar-tabs', tool: 'notion-get-sidebar-tabs', args: {} },
    { id: 'notion-search', tool: 'notion-search', args: { query: 'notes', page_size: 5 } },
    { id: 'notion-memory-search', tool: 'notion-memory-search', args: { query: 'notes', limit: 5 } },
    { id: 'notion-list-private-pages', tool: 'notion-list-private-pages', args: limit },
    { id: 'notion-list-shared-pages', tool: 'notion-list-shared-pages', args: limit },
    { id: 'notion-list-favorite-pages', tool: 'notion-list-favorite-pages', args: limit },
    { id: 'notion-list-recent-pages', tool: 'notion-list-recent-pages', args: limit },
    { id: 'notion-calendar-list-calendars', tool: 'notion-calendar-list-calendars', args: {} },
    { id: 'notion-calendar-list-contacts', tool: 'notion-calendar-list-contacts', args: {} },
    {
      id: 'notion-calendar-list-events',
      tool: 'notion-calendar-list-events',
      args: { timeMin: '2026-11-01T00:00:00Z', timeMax: '2026-11-08T00:00:00Z', timeZone: 'UTC' },
    },
  ],
  skipped: [
    ...['notion-query-meeting-notes', 'notion-query-sessions'].map((tool) => ({
      tool,
      reason: 'Answers "requires a Business plan" on other plans, so its latency would depend on the account, not the wrapper.',
    })),
    ...[
      'notion-fetch',
      'notion-get-comments',
      'notion-get-suggested-edit',
      'notion-get-version-changes',
      'notion-view-version',
      'notion-list-page-backlinks',
      'notion-query-data-sources',
      'notion-query-multiple-data-sources',
      'notion-download-attachment',
      'notion-get-file-download-urls',
      'notion-download-skill',
      'notion-get-async-task',
    ].map((tool) => ({ tool, reason: 'Needs an id or URL from an earlier read of the workspace, which this run does not keep.' })),
    ...[
      'notion-search-agents',
      'notion-search-sessions',
      'notion-get-session-status',
      'notion-wait-session',
      'notion-list-session-events',
      'notion-read-session-event',
    ].map((tool) => ({ tool, reason: 'Agent sessions: needs a session that exists, or waits on one.' })),
    ...['notion-calendar-list-coworkers-events', 'notion-calendar-list-calendar-resources'].map((tool) => ({
      tool,
      reason: 'Needs coworker emails or room-booking input that depend on the workspace.',
    })),
  ],
};
