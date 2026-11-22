import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  capOutput,
  createCodeModeServer,
  createStore,
  DESCRIPTION_BUDGET,
  filterTools,
  type ServiceConfig,
} from '../src/index.ts';

const fake = fileURLToPath(new URL('./fake-upstream.ts', import.meta.url));

function firstText(res: CallToolResult): string {
  const c = res.content[0];
  assert.ok(c && c.type === 'text', 'expected text content');
  return c.text;
}

async function connect(extra: Partial<ServiceConfig> = {}) {
  const cm = await createCodeModeServer({
    name: 'fake-codemode',
    upstream: { command: process.execPath, args: [fake] },
    ...extra,
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await cm.server.connect(b);
  const client = new Client({ name: 't', version: '1' });
  await client.connect(a);
  const run = async (code: string): Promise<CallToolResult> =>
    (await client.callTool({ name: 'execute_code', arguments: { code } })) as CallToolResult;
  const api = async (names?: string[]): Promise<CallToolResult> =>
    (await client.callTool({ name: 'get_api', arguments: names ? { names } : {} })) as CallToolResult;
  return {
    cm,
    run,
    api,
    close: async () => {
      await client.close();
      await cm.close();
    },
  };
}

test('capOutput: leaves short text, keeps 70% head and 30% tail with a marker', () => {
  assert.equal(capOutput('abc', 10), 'abc');
  const text = `${'H'.repeat(700)}${'m'.repeat(5000)}${'T'.repeat(300)}`;
  const out = capOutput(text, 1000);
  assert.ok(out.startsWith('H'.repeat(700)));
  assert.ok(out.endsWith('T'.repeat(300)));
  assert.match(out, /…\[5000 characters omitted/);
  assert.ok(!out.includes('m'.repeat(50)));
});

test('output cap: applies to the returned text only, not to data the script holds', async () => {
  const t = await connect({ limits: { maxOutputChars: 500 } });
  try {
    const res = await t.run(
      'const r = await codemode.big_text({n: 5000}); console.log("len", String(r).length); return String(r);',
    );
    const text = firstText(res);
    assert.match(text, /characters omitted/);
    assert.ok(text.length < 800, `got ${text.length}`);
    assert.match(text, /^len 5000/);
  } finally {
    await t.close();
  }
});

test('filterTools: allow, deny (wins), readOnly (annotations required)', () => {
  const mk = (name: string, readOnlyHint?: boolean): Tool => ({
    name,
    inputSchema: { type: 'object' },
    ...(readOnlyHint === undefined ? {} : { annotations: { readOnlyHint } }),
  });
  const tools = [mk('a', true), mk('b', false), mk('c')];
  const names = (x: Tool[]) => x.map((t) => t.name);
  assert.deepEqual(names(filterTools(tools, undefined)), ['a', 'b', 'c']);
  assert.deepEqual(names(filterTools(tools, { allow: ['a', 'c'] })), ['a', 'c']);
  assert.deepEqual(names(filterTools(tools, { deny: ['b'] })), ['a', 'c']);
  assert.deepEqual(names(filterTools(tools, { allow: ['a', 'b'], deny: ['a'] })), ['b']);
  assert.deepEqual(names(filterTools(tools, { readOnly: true })), ['a']);
  assert.deepEqual(names(filterTools(tools, { readOnly: true, allow: ['b', 'c'] })), []);
});

test('access: readOnly hides unannotated and destructive tools everywhere', async () => {
  const t = await connect({ access: { readOnly: true } });
  try {
    assert.deepEqual(Object.keys(t.cm.index.lines).sort(), ['big_text', 'get_thing']);
    assert.doesNotMatch(t.cm.description, /add_numbers|delete_thing|boom/);
    assert.doesNotMatch(t.cm.dts, /delete_thing/);
    assert.ok(t.cm.description.length <= DESCRIPTION_BUDGET + 200);
    const all = firstText(await t.api());
    assert.match(all, /get_thing/);
    assert.doesNotMatch(all, /delete_thing|add_numbers/);
    const hidden = await t.api(['delete_thing']);
    assert.equal(hidden.isError, true);
    const ok = await t.run('return await codemode.get_thing({})');
    assert.match(firstText(ok), /"thing": 1/);
    const blocked = await t.run('return await codemode.delete_thing({})');
    assert.equal(blocked.isError, true);
    assert.match(firstText(blocked), /not a function|undefined/);
    const direct = await t.run('return await __call("delete_thing", "{}")');
    assert.equal(direct.isError, true);
    assert.match(firstText(direct), /Unknown tool/);
  } finally {
    await t.close();
  }
});

test('access: allow, and deny wins over allow', async () => {
  const t = await connect({ access: { allow: ['add-numbers', 'get_thing'], deny: ['get_thing'] } });
  try {
    assert.deepEqual(Object.keys(t.cm.index.lines), ['add_numbers']);
    const res = await t.run('return await __call("get_thing", "{}")');
    assert.match(firstText(res), /Unknown tool "get_thing"/);
    const ok = await t.run('return (await codemode.add_numbers({a:1,b:1})).sum');
    assert.match(firstText(ok), /result: 2/);
  } finally {
    await t.close();
  }
});

test('access: deny only', async () => {
  const t = await connect({ access: { deny: ['delete_thing', 'boom'] } });
  try {
    assert.deepEqual(Object.keys(t.cm.index.lines).sort(), ['add_numbers', 'big_text', 'get_thing']);
  } finally {
    await t.close();
  }
});

test('store: persists across scripts, JSON values, delete and keys', async () => {
  const t = await connect();
  try {
    assert.match(
      firstText(await t.run('store.set("a", {x: [1, 2, {y: null}]}); store.set("b", "s"); return store.keys()')),
      /"a"[\s\S]*"b"/,
    );
    const second = await t.run(
      'const v = store.get("a"); const missing = store.get("zzz"); const d = store.delete("b"); return {v, missing: missing === undefined, d, keys: store.keys()}',
    );
    const text = firstText(second);
    assert.match(text, /"missing": true/);
    assert.match(text, /"d": true/);
    assert.match(text, /"y": null/);
    assert.match(firstText(await t.run('return store.keys()')), /"a"/);
    assert.doesNotMatch(firstText(await t.run('return store.keys()')), /"b"/);
  } finally {
    await t.close();
  }
});

test('store: rejects non-serialisable values and overflow, does not shadow tool ids', async () => {
  const t = await connect({ limits: { maxStoreChars: 100 } });
  try {
    const fn = await t.run('store.set("f", () => 1)');
    assert.equal(fn.isError, true);
    assert.match(firstText(fn), /JSON-serialisable/);
    const big = await t.run('store.set("k", "x".repeat(200))');
    assert.equal(big.isError, true);
    assert.match(firstText(big), /store is full/);
    // overwriting accounts for the old size, so repeated sets of one key fit
    const again = await t.run('for (let i = 0; i < 10; i++) store.set("k", "y".repeat(50)); return store.keys().length');
    assert.match(firstText(again), /result: 1/);
    // a tool named like a store id cannot exist: identifiers never contain a dot
    assert.doesNotMatch(t.cm.description, /__store/);
  } finally {
    await t.close();
  }
});

test('store: unit, size accounting and non-store ids', () => {
  const s = createStore(30);
  assert.deepEqual(s.handle('add_numbers', {}), { handled: false });
  s.handle('__store.set', { key: 'k', json: '"12345"' });
  assert.throws(() => s.handle('__store.set', { key: 'j', json: JSON.stringify('x'.repeat(40)) }), /store is full/);
  s.handle('__store.delete', { key: 'k' });
  s.handle('__store.set', { key: 'j', json: '"x"' });
  assert.deepEqual(s.handle('__store.keys', {}), { handled: true, value: ['j'] });
});

test('description: header with store sentence stays within budget alongside long instructions', async () => {
  const t = await connect({ instructions: 'x'.repeat(300) });
  try {
    assert.match(t.cm.description, /store\./);
    assert.ok(t.cm.description.length <= DESCRIPTION_BUDGET, `${t.cm.description.length}`);
  } finally {
    await t.close();
  }
});
