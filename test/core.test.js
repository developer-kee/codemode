import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCodeModeServer, runInSandbox } from '../src/index.js';

const fake = fileURLToPath(new URL('./fake-upstream.js', import.meta.url));

test('sandbox: logs, return, TS syntax, no network', async () => {
  const api = { namespace: 'codemode', ids: [], callTool: async () => null };
  const r = await runInSandbox('const x: number = 2; console.log("hi", x); return typeof fetch + typeof require;', api);
  assert.deepEqual(r.logs, ['hi 2']);
  assert.equal(r.result, 'undefinedundefined');
});

test('sandbox: timeout stops infinite loops', async () => {
  const api = { namespace: 'codemode', ids: [], callTool: async () => null };
  const r = await runInSandbox('while(true){}', api, { timeoutMs: 300 });
  assert.ok(r.error, 'expected an error');
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
  assert.equal(tools.tools[0].name, 'execute_code');

  const ok = await client.callTool({
    name: 'execute_code',
    arguments: { code: 'const r = await codemode.add_numbers({a:1,b:2}); const s = await codemode.add_numbers({a:r.sum,b:10}); return s.sum;' },
  });
  assert.match(ok.content[0].text, /result: 13/);

  const bad = await client.callTool({
    name: 'execute_code',
    arguments: { code: 'try { await codemode.boom({}); } catch (e) { console.log("caught", e.message); }' },
  });
  assert.match(bad.content[0].text, /caught kaboom/);

  await client.close();
  await close();
});
