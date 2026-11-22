import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portablePaths } from '../bench/lib/portable.ts';

test('portablePaths: the same prompt from Windows and Linux machines reads the same', () => {
  const windows = String.raw`Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows\report\2026 and C:\repos\codemode\bench\work\fs-sandbox. Then write notes/2026/note_1.md`;
  const linux = String.raw`Work only inside /tmp\codemode-bench-windows\report\2026 and /home/runner/work/codemode/codemode/bench/work/fs-sandbox. Then write notes/2026/note_1.md`;
  assert.equal(portablePaths(windows), portablePaths(linux));
  assert.match(portablePaths(windows), /^Work only inside <path> and <path>\./);
});

test('portablePaths: doubled backslashes from JSON.stringify are handled, urls and prose are left alone', () => {
  assert.equal(portablePaths(JSON.stringify({ path: String.raw`C:\repos\codemode\bench\work\fs-sandbox\calls\a.txt` })), '{"path":"<path>"}');
  assert.equal(portablePaths('open http://127.0.0.1:4817/form and click Submit'), 'open http://127.0.0.1:4817/form and click Submit');
  assert.equal(portablePaths('Create the folder report\\2026 there'), 'Create the folder report\\2026 there');
});
