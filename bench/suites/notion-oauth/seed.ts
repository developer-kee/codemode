// Seeds the test data for the Notion OAuth benchmark through the hosted server itself, with the saved sign-in:
// no integration token and no parent page id. Creates a private page "codemode bench <timestamp>" at the top level of
// the workspace with a "Bench Tasks" database of 40 rows (the same data and expected answers as the self-hosted suite),
// after moving older "codemode bench" pages to the trash.
//
// UNTESTED against the live server until the first run: the tool schemas were read, not exercised.
import { connectUpstream } from '../../../src/upstream.ts';
import { ids } from '../notion/fixture.ts';
import { seed } from '../notion/fixture.ts';

const SERVER_URL = 'https://mcp.notion.com/mcp';
const PREFIX = 'codemode bench';
const UUID = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i;

type Client = Awaited<ReturnType<typeof connectUpstream>>;

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text?: string }[]).map((c) => c.text ?? '').join('\n');
  if (res.isError === true) throw new Error(`${name} failed: ${text.slice(0, 300)}`);
  return text;
}

/** The first id after `marker` (a collection:// URL or a page URL), or the first id anywhere when no marker matches. */
function firstId(text: string, marker?: RegExp): string {
  const at = marker ? text.search(marker) : -1;
  const hit = UUID.exec(at >= 0 ? text.slice(at) : text);
  if (!hit) throw new Error(`No id found in: ${text.slice(0, 200)}`);
  return hit[0];
}

export async function seedViaOAuth(log: (line: string) => void = console.error): Promise<void> {
  const client = await connectUpstream({ url: SERVER_URL, oauth: { service: 'notion-oauth' } });
  try {
    // 1. Trash older bench pages (matched by exact title prefix, so nothing else in the account is touched).
    const found = JSON.parse(await call(client, 'notion-search', { query: PREFIX, page_size: 25 })) as {
      results?: { id: string; title?: string; type?: string }[];
    };
    const old = (found.results ?? []).filter((r) => r.type === 'page' && r.title?.startsWith(PREFIX)).map((r) => r.id);
    if (old.length > 0) {
      await call(client, 'notion-delete-pages', { page_ids: old.slice(0, 20), user_confirmed: true });
      log(`Moved ${Math.min(old.length, 20)} older "${PREFIX}" page(s) to the trash.`);
    }

    // 2. A private top-level page to hold the database.
    const page = await call(client, 'notion-create-pages', {
      pages: [{ properties: { title: `${PREFIX} ${new Date().toISOString().slice(0, 19).replace('T', ' ')}` } }],
      creation_mode: 'draft',
    });
    ids.root = firstId(page);

    // 3. The database.
    const owners = [...new Set(seed.map((t) => t.owner))].map((o) => `'${o}'`).join(', ');
    const database = await call(client, 'notion-create-database', {
      parent: { type: 'page_id', page_id: ids.root },
      title: 'Bench Tasks',
      schema: `CREATE TABLE ("Name" TITLE, "Status" SELECT('Todo', 'Doing', 'Done'), "Priority" NUMBER, "Owner" SELECT(${owners}))`,
    });
    ids.dataSource = firstId(database, /collection:\/\//);

    // 4. The 40 rows.
    await call(client, 'notion-create-pages', {
      parent: { type: 'data_source_id', data_source_id: ids.dataSource },
      pages: seed.map((t) => ({ properties: { Name: t.name, Status: t.status, Priority: t.priority, Owner: t.owner } })),
    });
    log(`Seeded ${seed.length} tasks under a new "${PREFIX}" page.`);
  } finally {
    await client.close();
  }
}
