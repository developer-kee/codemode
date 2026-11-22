import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createCodeModeServer, runInSandbox, type SandboxApi } from '../src/index.ts';

const fake = fileURLToPath(new URL('./fake-upstream.ts', import.meta.url));
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
  assert.equal(tools.tools.length, 1);
  assert.equal(tools.tools[0]?.name, 'execute_code');

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
