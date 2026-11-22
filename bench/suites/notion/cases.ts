import type { CallDef } from '../../lib/types/index.ts';
import { clearSummary, expected, ids, seedWorkspace } from './fixture.ts';

// Ids exist only after the workspace is seeded, so these arguments read them lazily (getters): `JSON.stringify`
// evaluates them when a case actually runs.
const dataSource = { get data_source_id(): string { return ids.dataSource; } };

/**
 * The official Notion server, one tool call at a time, against the seeded "Bench Tasks" database. Model prompts only
 * refer to titles (the model finds ids itself), never to ids. Write tools are skipped: the write-summary scenario
 * covers writing.
 *
 * UNTESTED AGAINST LIVE NOTION (see fixture.ts).
 */
export const notionCalls: CallDef = {
  async reset() {
    if (!ids.root) await seedWorkspace();
    await clearSummary();
  },
  cases: [
    { id: 'API-get-self', tool: 'API-get-self', args: {} },
    { id: 'API-get-users', tool: 'API-get-users', args: { page_size: 10 } },
    {
      id: 'API-post-search',
      tool: 'API-post-search',
      args: { query: 'Bench Tasks' },
      prompt: 'Search Notion for the database titled "Bench Tasks" and tell me its title in one short sentence.',
      expect: /Bench Tasks/,
    },
    {
      id: 'API-query-data-source',
      tool: 'API-query-data-source',
      args: { ...dataSource, page_size: 100 },
      prompt: 'How many tasks are in the Notion database titled "Bench Tasks"? Reply with one short sentence.',
      expect: new RegExp(`\\b${expected.todo + expected.doing + expected.done}\\b`),
    },
    { id: 'API-retrieve-a-data-source', tool: 'API-retrieve-a-data-source', args: { ...dataSource } },
    { id: 'API-retrieve-a-database', tool: 'API-retrieve-a-database', args: { get database_id(): string { return ids.database; } } },
    { id: 'API-list-data-source-templates', tool: 'API-list-data-source-templates', args: { ...dataSource } },
    { id: 'API-retrieve-a-page', tool: 'API-retrieve-a-page', args: { get page_id(): string { return ids.firstTask; } } },
    { id: 'API-retrieve-a-block', tool: 'API-retrieve-a-block', args: { get block_id(): string { return ids.root; } } },
    {
      id: 'API-get-block-children',
      tool: 'API-get-block-children',
      args: { get block_id(): string { return ids.root; } },
      prompt: 'List what is on the Notion page whose title starts with "codemode bench" and name the database you find there in one short sentence.',
      expect: /Bench Tasks/,
    },
    { id: 'API-retrieve-a-comment', tool: 'API-retrieve-a-comment', args: { get block_id(): string { return ids.root; } } },
    { id: 'API-retrieve-page-markdown', tool: 'API-retrieve-page-markdown', args: { get page_id(): string { return ids.root; } } },
  ],
  skipped: [
    { tool: 'API-get-user', reason: 'Needs a user id from a previous listing.' },
    { tool: 'API-retrieve-a-page-property', reason: 'Needs a property id from a previous read.' },
    { tool: 'API-post-page', reason: 'Creates pages in the workspace; the write-summary scenario covers writing.' },
    { tool: 'API-patch-page', reason: 'Edits pages in the workspace.' },
    { tool: 'API-patch-block-children', reason: 'Adds content to pages in the workspace.' },
    { tool: 'API-update-a-block', reason: 'Edits content in the workspace.' },
    { tool: 'API-delete-a-block', reason: 'Deletes content; not repeatable.' },
    { tool: 'API-create-a-comment', reason: 'Writes a comment visible to the workspace.' },
    { tool: 'API-create-a-data-source', reason: 'Creates a database in the workspace.' },
    { tool: 'API-update-a-data-source', reason: 'Changes the schema everything else depends on.' },
    { tool: 'API-move-page', reason: 'Moves pages in the workspace; not repeatable.' },
    { tool: 'API-update-page-markdown', reason: 'Rewrites page content.' },
  ],
};
