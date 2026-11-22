import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { classifyError } from '../src/audit.ts';
import { createCodeModeServer } from '../src/index.ts';

const fake = fileURLToPath(new URL('./helpers/fake-upstream.ts', import.meta.url));

test('an oversized upstream result has its own error class', () => {
  assert.equal(classifyError('big_text returned 5,000 characters, over the 1,000 limit for one result. Ask for less'), 'result-too-large');
  assert.equal(classifyError('Tool call limit reached (2 per script)'), 'limit');
});

test('a script cut off by its deadline is logged as a timeout, not a script error', async () => {
  const auditFile = join(mkdtempSync(join(tmpdir(), 'codemode-audit-')), 'audit.jsonl');
  const { server, close } = await createCodeModeServer({
    name: 'x',
    upstream: { command: process.execPath, args: [fake] },
    limits: { timeoutMs: 300 },
    auditFile,
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 't', version: '1' });
  await client.connect(a);
  try {
    await client.callTool({ name: 'execute_code', arguments: { code: 'while (true) {}' } });
  } finally {
    await client.close();
    await close();
  }
  const events = readFileSync(auditFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { error?: string; code?: string });
  assert.equal(events.at(-1)?.error, 'timeout');
  assert.equal(events.at(-1)?.code, undefined, 'the script text is still not logged');
});
