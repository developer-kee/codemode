import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { compactIndex, createCodeModeServer, DESCRIPTION_BUDGET, runInSandbox, type SandboxApi } from '../src/index.ts';

const fake = fileURLToPath(new URL('./helpers/fake-upstream.ts', import.meta.url));
const noTools: SandboxApi = { namespace: 'codemode', ids: [], callTool: () => Promise.resolve(null) };

function firstText(res: CallToolResult): string {
  const c = res.content[0];
  assert.ok(c && c.type === 'text', 'expected text content');
  return c.text;
}

test('sandbox: logs, return, TS syntax, no network', async () => {
  const r = await runInSandbox(
    'const x: number = 2; console.log("hi", x); return typeof fetch + typeof require;',
    noTools,
  );
  assert.deepEqual(r.logs, ['hi 2']);
  assert.equal(r.result, 'undefinedundefined');
});

test('sandbox: timeout stops infinite loops', async () => {
  const r = await runInSandbox('while(true){}', noTools, { timeoutMs: 300 });
  assert.ok(r.error, 'expected an error');
});

test('sandbox: guest cannot reach unknown tools', async () => {
  const api: SandboxApi = {
    namespace: 'codemode',
    ids: ['ok'],
    callTool: (id) => (id === 'ok' ? Promise.resolve(1) : Promise.reject(new Error('Unknown tool'))),
  };
  const r = await runInSandbox('return await __call("nope", "{}")', api);
  assert.match(r.error ?? '', /Unknown tool/);
});

function syntheticTools(n: number): Tool[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `tool_number_${i}`,
    description: `Does thing ${i}. Longer explanation that should be cut after the first sentence.`,
    inputSchema: {
      type: 'object' as const,
      properties: { id: { type: 'string' }, mode: { enum: ['a', 'b'] }, limit: { type: 'integer' } },
      required: ['id'],
    },
  }));
}

test('compactIndex: always fits the budget and always names every tool when it can', () => {
  for (const n of [3, 20, 60, 400]) {
    const tools = syntheticTools(n);
    const idx = compactIndex(tools, 1500);
    assert.ok(idx.text.length <= 1500, `${n} tools -> ${idx.text.length} chars at level ${idx.level}`);
    if (idx.level < 4) for (const t of tools) assert.ok(idx.text.includes(t.name), `${t.name} missing at level ${idx.level}`);
  }
  assert.equal(compactIndex(syntheticTools(3), 1500).level, 1);
  assert.ok(compactIndex(syntheticTools(400), 1500).level >= 3);
});

test('sandbox: several slow upstream calls in one script, then another script, still work', async () => {
  const { server, close } = await createCodeModeServer({
    name: 'slow',
    upstream: { command: process.execPath, args: [fake] },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 't', version: '1' });
  await client.connect(a);
  const script =
    'let t = 0; for (let i = 1; i <= 5; i++) { t += (await codemode.add_numbers({ a: i, b: i })).sum; } ' +
    'const both = await Promise.all([codemode.add_numbers({ a: 1, b: 1 }), codemode.add_numbers({ a: 2, b: 2 })]); ' +
    'return t + both[0].sum + both[1].sum;';
  for (let round = 0; round < 3; round++) {
    const r = (await client.callTool({ name: 'execute_code', arguments: { code: script } })) as CallToolResult;
    assert.equal(r.isError, false, firstText(r));
    assert.match(firstText(r), /result: 36/); // 2+4+6+8+10 + 2 + 4
  }
  await client.close();
  await close();
});

test('end to end: one execute_code call chains upstream tools', async () => {
  const { server, dts, close } = await createCodeModeServer({
    name: 'fake-codemode',
    upstream: { command: process.execPath, args: [fake] },
  });
  assert.match(dts, /add_numbers\(input: AddNumbersInput\)/);

  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 't', version: '1' });
  await client.connect(a);

  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((t) => t.name).sort(), ['execute_code', 'get_api']);
  const description = tools.tools.find((t) => t.name === 'execute_code')?.description ?? '';
  assert.ok(description.length <= DESCRIPTION_BUDGET + 200, `description is ${description.length} chars`);
  assert.match(description, /add_numbers\(\{ a: number; b: number \}\)/);

  const api = (await client.callTool({ name: 'get_api', arguments: { names: ['add-numbers'] } })) as CallToolResult;
  assert.match(firstText(api), /export interface AddNumbersInput/);
  const noSuch = (await client.callTool({ name: 'get_api', arguments: { names: ['nope'] } })) as CallToolResult;
  assert.equal(noSuch.isError, true);

  const badArgs = (await client.callTool({
    name: 'execute_code',
    arguments: { code: 'return await codemode.add_numbers({a: "x"});' },
  })) as CallToolResult;
  assert.equal(badArgs.isError, true);
  assert.match(firstText(badArgs), /Invalid arguments for add_numbers/);
  assert.match(firstText(badArgs), /Expected: add_numbers\(\{ a: number; b: number \}\)/);

  const ok = (await client.callTool({
    name: 'execute_code',
    arguments: {
      code: 'const r = await codemode.add_numbers({a:1,b:2}); const s = await codemode.add_numbers({a:r.sum,b:10}); return s.sum;',
    },
  })) as CallToolResult;
  assert.match(firstText(ok), /result: 13/);

  const bad = (await client.callTool({
    name: 'execute_code',
    arguments: { code: 'try { await codemode.boom({}); } catch (e) { console.log("caught", e.message); }' },
  })) as CallToolResult;
  assert.match(firstText(bad), /caught kaboom/);

  await client.close();
  await close();
});
