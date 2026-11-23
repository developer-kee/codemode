import assert from 'node:assert/strict';
import { test } from 'node:test';

// The service file reads its environment when it loads, so each case imports a fresh copy (the query string defeats the module cache).
async function load(env: Record<string, string>, tag: string): Promise<{ command: string; args: string[] }> {
  const saved = { ...process.env };
  for (const k of ['CODEMODE_SOLIDCRAFT_HEADLESS', 'CODEMODE_SOLIDCRAFT_CONNECT', 'CODEMODE_SOLIDCRAFT_TOKEN', 'CODEMODE_SOLIDCRAFT_ALLOW_PATHS']) delete process.env[k];
  Object.assign(process.env, env);
  try {
    const mod = (await import(`../services/solidcraft/index.ts?${tag}`)) as { default: { upstream: { command: string; args: string[] } } };
    return mod.default.upstream;
  } finally {
    process.env = saved;
  }
}

test('solidcraft: by default a headless session with no path limit lifted', async () => {
  const up = await load({}, 'default');
  assert.deepEqual(up.args, ['mcp']);
});

test('solidcraft: --connect is added for this machine, with the token only when given, and extra folders are allowed one by one', async () => {
  const up = await load({ CODEMODE_SOLIDCRAFT_CONNECT: '127.0.0.1:7878', CODEMODE_SOLIDCRAFT_TOKEN: 'abc', CODEMODE_SOLIDCRAFT_ALLOW_PATHS: 'D:\a; D:\b' }, 'connect');
  assert.deepEqual(up.args, ['mcp', '--connect', '127.0.0.1:7878', '--token', 'abc', '--allow-path', 'D:\a', '--allow-path', 'D:\b']);
  assert.ok(!up.args.includes('--allow-any-path'));
});

test('solidcraft: a remote address is refused', async () => {
  await assert.rejects(load({ CODEMODE_SOLIDCRAFT_CONNECT: '192.168.1.20:7878' }, 'remote'), /must be this machine/);
  await assert.rejects(load({ CODEMODE_SOLIDCRAFT_CONNECT: '127.0.0.1.evil.example:7878' }, 'spoof'), /must be this machine/);
});

test('solidcraft: CODEMODE_SOLIDCRAFT_HEADLESS forces a headless session, and cannot be combined with --connect', async () => {
  const up = await load({ CODEMODE_SOLIDCRAFT_HEADLESS: '1' }, 'headless');
  assert.deepEqual(up.args, ['mcp', '--headless']);
  await assert.rejects(load({ CODEMODE_SOLIDCRAFT_HEADLESS: '1', CODEMODE_SOLIDCRAFT_CONNECT: '127.0.0.1:27878' }, 'both'), /cannot both be set/);
});
