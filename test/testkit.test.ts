import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasNumber } from '../bench/lib/testkit.ts';

test('hasNumber accepts digits, separators and numbers written as words', () => {
  assert.equal(hasNumber('Seven tasks are Done.', 7), true);
  assert.equal(hasNumber('There are twenty-three open', 23), true);
  assert.equal(hasNumber('about 1,200 rows', 1200), true);
  assert.equal(hasNumber('Priority is ten', 10), true);
  assert.equal(hasNumber('Seventeen tasks', 7), false);
  assert.equal(hasNumber('twenty tasks', 2), false);
});
