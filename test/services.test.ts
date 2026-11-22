import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { listServices, SERVICE_NAME } from '../src/services.ts';

test('services are found at the top level and inside group folders', () => {
  const names = listServices(fileURLToPath(new URL('../services/', import.meta.url)));
  for (const expected of ['blender', 'notion/oauth', 'notion/token']) assert.ok(names.includes(expected), expected);
  assert.ok(names.every((n) => SERVICE_NAME.test(n)));
});

test('a service name cannot leave services/', () => {
  for (const bad of ['../x', 'a/../b', '/etc/passwd', 'a//b', 'a\b', 'a/', '']) assert.equal(SERVICE_NAME.test(bad), false, bad);
  for (const good of ['blender', 'notion/oauth', 'a-b_c/d']) assert.equal(SERVICE_NAME.test(good), true, good);
});
