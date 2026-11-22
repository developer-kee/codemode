// The sandbox runs on a worker thread: a runaway script must not stall the wrapper or other scripts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { createStore, runInSandbox } from '../src/index.ts';
import type { SandboxApi } from '../src/index.ts';

const store = createStore();
const api: SandboxApi = {
  namespace: 'codemode',
  ids: ['echo', 'fail'],
  callTool: async (id, input) => {
    if (id === 'fail') throw new Error('upstream said no');
    return { echoed: input };
  },
  syncCall: (id, input) => store.handle(id, input),
};

test('a script that spins forever does not stall the main thread', async () => {
  let worst = 0;
  let last = performance.now();
  const ticker = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
  }, 20);
  const started = performance.now();
  const out = await runInSandbox('while (true) {}', api, { timeoutMs: 800 });
  clearInterval(ticker);
  assert.match(out.error ?? '', /interrupted|timed out/i);
  assert.ok(performance.now() - started >= 700, 'the script really ran until its deadline');
  assert.ok(worst < 250, `the main thread stalled for ${worst.toFixed(0)} ms`);
});

test('a busy script does not delay another script running at the same time', async () => {
  const busy = runInSandbox('while (true) {}', api, { timeoutMs: 1000 });
  const started = performance.now();
  const quick = await runInSandbox('return 1 + 1', api);
  const took = performance.now() - started;
  assert.equal(quick.result, 2);
  assert.ok(took < 500, `the quick script waited ${took.toFixed(0)} ms behind the busy one`);
  await busy;
});

test('after a timed-out script the next one runs normally', async () => {
  await runInSandbox('while (true) {}', api, { timeoutMs: 300 });
  const out = await runInSandbox('return await codemode.echo({ a: 1 })', api);
  assert.deepEqual(out.result, { echoed: { a: 1 } });
});

test('upstream errors, parallel calls and the store work through the worker', async () => {
  const failed = await runInSandbox('try { await codemode.fail({}); } catch (e) { return String(e.message); }', api);
  assert.equal(failed.result, 'upstream said no');
  const many = await runInSandbox('return (await Promise.all([1, 2, 3].map((n) => codemode.echo({ n })))).map((r) => r.echoed.n)', api);
  assert.deepEqual(many.result, [1, 2, 3]);
  await runInSandbox('store.set("k", { v: 42 })', api);
  const read = await runInSandbox('return store.get("k")', api);
  assert.deepEqual(read.result, { v: 42 });
});

test('a store error reaches the script as an exception', async () => {
  const tiny: SandboxApi = { ...api, syncCall: (id, input) => createStore(10).handle(id, input) };
  const out = await runInSandbox('try { store.set("big", "x".repeat(100)); } catch (e) { return String(e.message); }', tiny);
  assert.match(String(out.result), /store is full/);
});
