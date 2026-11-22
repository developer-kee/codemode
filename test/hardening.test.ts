import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { assignIdentifiers, createCodeModeServer, runInSandbox } from '../src/index.ts';
import { createLimiter } from '../src/limiter.ts';
import { assertSecureUrl, upstreamEnv } from '../src/upstream.ts';

const fake = fileURLToPath(new URL('./helpers/fake-upstream.ts', import.meta.url));

function text(res: CallToolResult): string {
  const c = res.content[0];
  assert.ok(c && c.type === 'text');
  return c.text;
}

async function connect(config: Parameters<typeof createCodeModeServer>[0]) {
  const { server, close } = await createCodeModeServer(config);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 't', version: '1' });
  await client.connect(a);
  return { client, close: async () => { await client.close(); await close(); } };
}

test('identifiers: collisions get distinct ids and reserved names are prefixed', () => {
  const idOf = assignIdentifiers(['read-file', 'read_file', '__proto__', 'constructor', 'toString', 'plain']);
  const ids = ['read-file', 'read_file', '__proto__', 'constructor', 'toString', 'plain'].map(idOf);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(',')}`);
  assert.equal(idOf('read-file'), 'read_file');
  assert.equal(idOf('read_file'), 'read_file_2');
  for (const reserved of ['__proto__', 'constructor', 'toString']) assert.match(idOf(reserved), /^tool_/);
  assert.equal(idOf('plain'), 'plain');
});

test('identifiers: a colliding or reserved tool name cannot reach another tool or the prototype', async () => {
  const tool = (name: string): Tool => ({ name, description: name, inputSchema: { type: 'object', properties: {} } });
  const { generateApi } = await import('../src/generate.ts');
  const { names } = await generateApi([tool('a-b'), tool('a_b'), tool('__proto__')]);
  assert.deepEqual(Object.keys(names).sort(), ['a_b', 'a_b_2', 'tool_proto__']);
  assert.equal(names['a_b'], 'a-b');
  assert.equal(names['a_b_2'], 'a_b');
  assert.equal(Object.getPrototypeOf(names), null);
  assert.equal(({} as Record<string, unknown>)['polluted'], undefined);
});

test('upstream env: only the safe default, passEnv and env reach the child', () => {
  process.env['CODEMODE_TEST_LEAK'] = 'secret';
  process.env['CODEMODE_TEST_PASSED'] = 'shared';
  try {
    const env = upstreamEnv({ passEnv: ['CODEMODE_TEST_PASSED', 'CODEMODE_TEST_MISSING'], env: { EXPLICIT: '1' } });
    assert.equal(env['CODEMODE_TEST_LEAK'], undefined);
    assert.equal(env['CODEMODE_TEST_PASSED'], 'shared');
    assert.equal('CODEMODE_TEST_MISSING' in env, false);
    assert.equal(env['EXPLICIT'], '1');
    assert.ok(env['PATH'] ?? env['Path'], 'the default environment keeps PATH so npx and uvx still work');
  } finally {
    delete process.env['CODEMODE_TEST_LEAK'];
    delete process.env['CODEMODE_TEST_PASSED'];
  }
});

test('upstream env, end to end: a variable in the wrapper is invisible to the upstream unless passed', async () => {
  process.env['CODEMODE_TEST_SECRET'] = 'hunter2';
  try {
    const closed = await connect({ name: 'closed', upstream: { command: process.execPath, args: [fake] } });
    const hidden = (await closed.client.callTool({ name: 'execute_code', arguments: { code: 'return await codemode.has_env({});' } })) as CallToolResult;
    assert.match(text(hidden), /"set": false/);
    await closed.close();

    const open = await connect({ name: 'open', upstream: { command: process.execPath, args: [fake], passEnv: ['CODEMODE_TEST_SECRET'] } });
    const shown = (await open.client.callTool({ name: 'execute_code', arguments: { code: 'return await codemode.has_env({});' } })) as CallToolResult;
    assert.match(text(shown), /"set": true/);
    await open.close();
  } finally {
    delete process.env['CODEMODE_TEST_SECRET'];
  }
});

test('remote upstream: https and loopback http only', () => {
  assert.doesNotThrow(() => assertSecureUrl('https://mcp.example.com/mcp'));
  assert.doesNotThrow(() => assertSecureUrl('http://localhost:3000/mcp'));
  assert.doesNotThrow(() => assertSecureUrl('http://127.0.0.1:3000/mcp'));
  assert.throws(() => assertSecureUrl('http://mcp.example.com/mcp'), /use https/);
  assert.throws(() => assertSecureUrl('ftp://mcp.example.com/mcp'), /use https/);
});

test('limiter: never runs more than max tasks at once and keeps order', async () => {
  const limit = createLimiter(3);
  let active = 0;
  let peak = 0;
  const started: number[] = [];
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      limit(async () => {
        started.push(i);
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return i;
      }),
    ),
  );
  assert.equal(peak, 3);
  assert.deepEqual(results, [...Array(12).keys()]);
  assert.deepEqual(started, [...Array(12).keys()]);
});

test('sandbox: upstream calls still running when a script times out are aborted', async () => {
  let seen: AbortSignal | undefined;
  const api = {
    namespace: 'codemode',
    ids: ['hang'],
    callTool: (_id: string, _input: unknown, signal?: AbortSignal): Promise<unknown> => {
      seen = signal;
      return new Promise(() => undefined); // never settles, like a stuck upstream
    },
  };
  const out = await runInSandbox('await codemode.hang({});', api, { timeoutMs: 300 });
  assert.match(out.error ?? '', /timed out/);
  assert.ok(seen, 'the call received a signal');
  assert.equal(seen?.aborted, true);
});

test('sandbox: a script that ends early aborts the calls it did not wait for', async () => {
  let seen: AbortSignal | undefined;
  const api = {
    namespace: 'codemode',
    ids: ['slow'],
    callTool: (_id: string, _input: unknown, signal?: AbortSignal): Promise<unknown> => {
      seen = signal;
      return new Promise((resolve) => setTimeout(() => resolve(1), 2000));
    },
  };
  const started = Date.now();
  const out = await runInSandbox('codemode.slow({}); return 1;', api, { timeoutMs: 5000 });
  assert.equal(out.result, 1);
  assert.ok(Date.now() - started < 1500, 'returned without waiting for the unawaited call');
  assert.equal(seen?.aborted, true);
});
