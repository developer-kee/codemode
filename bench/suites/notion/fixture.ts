import { lcg } from '../../lib/testkit.ts';
// Seeds a throwaway Notion database through the REST API for the Notion benchmark.
//
// UNTESTED AGAINST LIVE NOTION. This was written from the API documentation (version 2025-09-03, data sources) without
// access to a workspace, and has only been type-checked. Expect to adjust request shapes on the first real run.
//
// Needs NOTION_TOKEN (an internal integration token) and NOTION_BENCH_PAGE_ID (a page shared with that integration,
// under which a "codemode bench <timestamp>" page is created and older ones are moved to the trash).

const VERSION = '2025-09-03';
const BASE = 'https://api.notion.com/v1';
const PREFIX = 'codemode bench';

// ---- deterministic seed: 40 tasks ----------------------------------------------------------------------------------
export interface SeedTask {
  name: string;
  status: 'Todo' | 'Doing' | 'Done';
  priority: number;
  owner: string;
}


function build(): SeedTask[] {
  const rnd = lcg(808);
  const owners = ['Ada', 'Grace', 'Linus', 'Margaret'];
  const statuses: SeedTask['status'][] = ['Todo', 'Doing', 'Done'];
  const out: SeedTask[] = [];
  for (let i = 1; i <= 40; i++) {
    out.push({
      name: `Task ${String(i).padStart(2, '0')}`,
      status: statuses[Math.floor(rnd() * 3)] as SeedTask['status'],
      priority: 1 + Math.floor(rnd() * 10),
      owner: owners[Math.floor(rnd() * owners.length)] as string,
    });
  }
  // Make two answers unambiguous: Margaret carries clearly the most open work, and one Doing task has the top priority.
  for (let i = 0; i < 12; i++) if (out[i]) out[i] = { ...(out[i] as SeedTask), owner: 'Margaret', status: i % 3 === 0 ? 'Doing' : 'Todo' };
  out[3] = { ...(out[3] as SeedTask), status: 'Doing', priority: 10 };
  for (let i = 12; i < 40; i++) if (out[i] && (out[i] as SeedTask).status === 'Doing' && (out[i] as SeedTask).priority === 10) out[i] = { ...(out[i] as SeedTask), priority: 9 };
  return out;
}

export const seed: SeedTask[] = build();

const count = (s: SeedTask['status']): number => seed.filter((t) => t.status === s).length;
export const expected = {
  done: count('Done'),
  todo: count('Todo'),
  doing: count('Doing'),
  maxPriorityDoing: Math.max(...seed.filter((t) => t.status === 'Doing').map((t) => t.priority)),
  ...(() => {
    const open = new Map<string, number>();
    for (const t of seed) if (t.status !== 'Done') open.set(t.owner, (open.get(t.owner) ?? 0) + 1);
    const top = [...open.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] as [string, number];
    return { busiestOwner: top[0], busiestOwnerOpen: top[1] };
  })(),
};

// ---- REST ---------------------------------------------------------------------------------------------------------------
function token(): string {
  const t = process.env['NOTION_TOKEN'];
  if (!t) throw new Error('NOTION_TOKEN is not set. Create an internal integration, share a test page with it, and set NOTION_TOKEN in your shell.');
  return t;
}

export function parentPageId(): string {
  const id = process.env['NOTION_BENCH_PAGE_ID'];
  if (!id) throw new Error('NOTION_BENCH_PAGE_ID is not set. Share an empty test page with your integration and set its id (the 32 hex characters at the end of its URL).');
  return id;
}

type Json = Record<string, unknown>;

export async function notion(method: string, path: string, body?: unknown): Promise<Json> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token()}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') ?? '1') * 1000));
      continue;
    }
    const json = (await res.json()) as Json;
    if (!res.ok) throw new Error(`Notion ${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json;
  }
  throw new Error(`Notion ${method} ${path}: rate limited too many times`);
}

const title = (text: string): Json => ({ title: [{ text: { content: text } }] });

/** Ids of what the last `seedWorkspace` created. Read lazily (getters) because they are only known after seeding. */
export const ids = { root: '', database: '', dataSource: '', firstTask: '' };

async function trashOldRoots(parent: string): Promise<void> {
  const kids = (await notion('GET', `/blocks/${parent}/children?page_size=100`)) as { results?: { id: string; type: string; child_page?: { title: string } }[] };
  for (const k of kids.results ?? []) {
    if (k.type === 'child_page' && k.child_page?.title.startsWith(PREFIX)) await notion('PATCH', `/pages/${k.id}`, { in_trash: true });
  }
}

/** Create a fresh bench page with the seeded "Bench Tasks" database under the shared parent page. Takes about 15 s. */
export async function seedWorkspace(): Promise<void> {
  const parent = parentPageId();
  await trashOldRoots(parent);
  const root = await notion('POST', '/pages', {
    parent: { type: 'page_id', page_id: parent },
    properties: { title: title(`${PREFIX} ${new Date().toISOString()}`) },
  });
  ids.root = root['id'] as string;
  const db = (await notion('POST', '/databases', {
    parent: { type: 'page_id', page_id: ids.root },
    title: [{ text: { content: 'Bench Tasks' } }],
    initial_data_source: {
      properties: {
        Name: { title: {} },
        Status: { select: { options: [{ name: 'Todo' }, { name: 'Doing' }, { name: 'Done' }] } },
        Priority: { number: {} },
        Owner: { select: { options: ['Ada', 'Grace', 'Linus', 'Margaret'].map((name) => ({ name })) } },
      },
    },
  })) as { id: string; data_sources?: { id: string }[] };
  ids.database = db.id;
  ids.dataSource = db.data_sources?.[0]?.id ?? db.id;
  for (const t of seed) {
    const page = await notion('POST', '/pages', {
      parent: { type: 'data_source_id', data_source_id: ids.dataSource },
      properties: {
        Name: title(t.name),
        Status: { select: { name: t.status } },
        Priority: { number: t.priority },
        Owner: { select: { name: t.owner } },
      },
    });
    if (!ids.firstTask) ids.firstTask = page['id'] as string;
    await new Promise((r) => setTimeout(r, 340)); // stay under the 3 requests per second average
  }
}

/** Trash any "Summary" page the write task created, so every attempt starts clean. */
export async function clearSummary(): Promise<void> {
  if (!ids.root) return;
  const kids = (await notion('GET', `/blocks/${ids.root}/children?page_size=100`)) as { results?: { id: string; type: string; child_page?: { title: string } }[] };
  for (const k of kids.results ?? []) if (k.type === 'child_page' && k.child_page?.title === 'Summary') await notion('PATCH', `/pages/${k.id}`, { in_trash: true });
}

/** The plain text of every paragraph on the first page titled "Summary" under the bench root, or undefined if none. */
export async function readSummary(): Promise<string[] | undefined> {
  const kids = (await notion('GET', `/blocks/${ids.root}/children?page_size=100`)) as { results?: { id: string; type: string; child_page?: { title: string } }[] };
  const page = (kids.results ?? []).find((k) => k.type === 'child_page' && k.child_page?.title === 'Summary');
  if (!page) return undefined;
  const blocks = (await notion('GET', `/blocks/${page.id}/children?page_size=100`)) as {
    results?: { type: string; [k: string]: unknown }[];
  };
  const out: string[] = [];
  for (const b of blocks.results ?? []) {
    const rich = ((b[b.type] as { rich_text?: { plain_text?: string }[] } | undefined)?.rich_text ?? []).map((r) => r.plain_text ?? '').join('');
    if (rich) out.push(rich);
  }
  return out;
}
