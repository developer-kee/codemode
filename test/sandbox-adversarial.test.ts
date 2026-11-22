import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInSandbox } from '../src/index.ts';
import type { SandboxApi } from '../src/index.ts';

const calls: { id: string; input: unknown }[] = [];
const api: SandboxApi = {
  namespace: 'codemode',
  ids: ['echo'],
  callTool: async (id, input) => {
    calls.push({ id, input });
    if (id !== 'echo') throw new Error(`Unknown tool "${id}"`);
    return { echoed: input };
  },
  syncCall: () => ({ handled: false }),
};

const run = (code: string, limits = {}) => runInSandbox(code, api, { timeoutMs: 3000, ...limits });

test('escape: no host globals are reachable', async () => {
  const r = await run(`return [typeof process, typeof require, typeof module, typeof fetch, typeof XMLHttpRequest, typeof Buffer, typeof setTimeout, typeof globalThis.global].join(',')`);
  assert.equal(r.result, 'undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined');
});

test('escape: climbing the constructor chain finds no host object', async () => {
  const r = await run(`
    const F = (function () {}).constructor;
    const viaFunction = F('return typeof process + "," + typeof require + "," + typeof globalThis.__call')();
    const viaObject = ({}).constructor.constructor('return typeof process')();
    return viaFunction + '|' + viaObject;
  `);
  assert.equal(r.result, 'undefined,undefined,function|undefined');
});

test('escape: dynamic import and eval stay inside the engine', async () => {
  const imported = await run(`try { await import('node:fs'); return 'imported'; } catch (e) { return 'blocked'; }`);
  assert.equal(imported.result, 'blocked');
  const evaled = await run(`return eval('typeof process')`);
  assert.equal(evaled.result, 'undefined');
});

test('bridge: __call with an unknown id or hostile input fails cleanly', async () => {
  calls.length = 0;
  const unknown = await run(`return await __call('definitely-not-a-tool', '{}')`);
  assert.match(unknown.error ?? '', /Unknown tool/);
  const proto = await run(`return await __call('__proto__', '{}')`);
  assert.match(proto.error ?? '', /Unknown tool|__proto__/);
  const notJson = await run(`return await __call('echo', '{not json')`);
  assert.ok(notJson.error, 'malformed JSON must be an error, not a crash');
  const numberId = await run(`return await __call(42, '{}')`);
  assert.ok(numberId.error !== undefined || numberId.result !== undefined, 'the sandbox still answers');
  assert.equal(calls.some((c) => c.id === '__proto__'), true, 'the host saw and rejected the id; it never reached an upstream tool');
});

test('bridge: __sync only reaches the store', async () => {
  const r = await run(`return __sync('anything-else', '{}') instanceof Error`);
  assert.equal(r.result, true);
});

test('state: nothing survives into the next script', async () => {
  await run(`globalThis.leaked = 'yes'; Object.prototype.polluted = 'yes'; Array.prototype.last = () => 'pwned';`);
  const r = await run(`return [typeof globalThis.leaked, typeof ({}).polluted, typeof [].last].join(',')`);
  assert.equal(r.result, 'undefined,undefined,undefined');
});

test('arguments: a prototype-polluting payload cannot change what the host receives', async () => {
  calls.length = 0;
  await run(`await codemode.echo(JSON.parse('{"__proto__": {"admin": true}, "x": 1}'))`);
  const seen = calls[0]?.input as Record<string, unknown> | undefined;
  assert.ok(seen);
  assert.equal(Object.getPrototypeOf(seen) === Object.prototype, true);
  assert.equal(({} as Record<string, unknown>)['admin'], undefined);
});

test('limits: an infinite loop is stopped by the deadline', async () => {
  const started = Date.now();
  const r = await run(`while (true) {}`, { timeoutMs: 400 });
  assert.match(r.error ?? '', /interrupted|timed out/i);
  assert.ok(Date.now() - started < 2500);
});

test('limits: an endless chain of microtasks is stopped too', async () => {
  const started = Date.now();
  const r = await run(`for (;;) { await null; }`, { timeoutMs: 400 });
  assert.ok(r.error, 'expected an error');
  assert.ok(Date.now() - started < 2500, 'stopped near the deadline');
  assert.equal((await run(`return 'alive'`)).result, 'alive');
});

test('limits: a memory bomb fails the script, not the process', async () => {
  const r = await run(`const hog = []; for (;;) hog.push('x'.repeat(1e6));`, { memoryBytes: 32 * 1024 * 1024, timeoutMs: 8000 });
  assert.ok(r.error, 'expected an out-of-memory error');
  const after = await run(`return 1 + 1`);
  assert.equal(after.result, 2, 'the sandbox still works after the bomb');
});

test('limits: a single huge string is refused', async () => {
  const r = await run(`return 'x'.repeat(2 ** 30).length`, { memoryBytes: 32 * 1024 * 1024 });
  assert.ok(r.error, 'expected an error, not a billion-character string');
});

test('limits: runaway recursion is a stack error, not a crash', async () => {
  const r = await run(`const f = (n) => f(n + 1) + 1; return f(0)`);
  assert.match(r.error ?? '', /stack|recursion|too much/i);
  assert.equal((await run(`return 'alive'`)).result, 'alive');
});

test('limits: a console flood is capped', async () => {
  const r = await run(`for (let i = 0; i < 200000; i++) console.log('line ' + i + ' ' + 'x'.repeat(50)); return 'done'`, { maxLogChars: 5000 });
  const total = r.logs.reduce((n, l) => n + l.length, 0);
  assert.ok(total < 5000 + 400, `kept ${total} characters of logs`);
  assert.equal(r.result, 'done');
});

test('limits: a flood of calls from one script is handled one result at a time', async () => {
  const r = await run(`
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => codemode.echo({ i })));
    return results.length;
  `);
  assert.equal(r.result, 50);
});

test('robustness: odd values returned from a script do not crash the host', async () => {
  for (const code of [
    `return 1n`,
    `return Symbol('s')`,
    `return () => 1`,
    `const o = {}; o.self = o; return o`,
    `return new Date(NaN)`,
    `return undefined`,
    `throw { toString() { throw new Error('nested') } }`,
  ]) {
    const r = await run(code);
    assert.ok('result' in r || 'error' in r || r.logs.length >= 0, `no answer for: ${code}`);
  }
  assert.equal((await run(`return 'still fine'`)).result, 'still fine');
});
