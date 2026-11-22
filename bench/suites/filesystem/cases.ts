import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CallDef } from '../../lib/types/index.ts';
import { SANDBOX } from './tasks.ts';

/** Inside the allowed directory, so the same server setup serves both the scenario tasks and these cases. */
const dir = join(SANDBOX, 'calls');

/**
 * The Filesystem server, one tool call at a time. Calls that cannot be repeated against the same state
 * (move, copy) or need media files are skipped on purpose; the `organize` scenario covers moving.
 */
export const filesystemCalls: CallDef = {
  async reset() {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(join(dir, 'a.txt'), 'hello-4821');
    writeFileSync(join(dir, 'b.txt'), 'second file');
    writeFileSync(join(dir, 'sub', 'c.txt'), 'third file');
    writeFileSync(join(dir, 'edit.txt'), 'status: AAA\n');
  },
  cases: [
    {
      id: 'list_allowed_directories',
      tool: 'list_allowed_directories',
      args: {},
      prompt: 'Which directories are you allowed to access? Reply with one short sentence naming the folder.',
      expect: /fs-sandbox|bench[\\/]+work/i, // direct reports the client's root (bench/work), codemode the sandbox: both are fine
    },
    {
      id: 'read_text_file',
      tool: 'read_text_file',
      args: { path: join(dir, 'a.txt') },
      prompt: `Read the file ${join(dir, 'a.txt')} and tell me exactly what it contains.`,
      expect: /hello-4821/,
    },
    {
      id: 'read_multiple_files',
      tool: 'read_multiple_files',
      args: { paths: [join(dir, 'a.txt'), join(dir, 'b.txt')] },
      prompt: `Read ${join(dir, 'a.txt')} and ${join(dir, 'b.txt')} and tell me what each contains, in one short sentence.`,
      expect: /hello-4821[\s\S]*second file|second file[\s\S]*hello-4821/,
    },
    {
      id: 'list_directory',
      tool: 'list_directory',
      args: { path: dir },
      prompt: `List the contents of ${dir} and reply with the names in one short sentence.`,
      async check(answer) {
        const missing = ['a.txt', 'b.txt', 'sub', 'edit.txt'].filter((n) => !answer.includes(n));
        return missing.length === 0 ? { pass: true, detail: 'ok' } : { pass: false, detail: `answer lacks ${missing.join(', ')}` };
      },
    },
    { id: 'list_directory_with_sizes', tool: 'list_directory_with_sizes', args: { path: dir, sortBy: 'name' } },
    {
      id: 'directory_tree',
      tool: 'directory_tree',
      args: { path: dir },
      prompt: `Show the folder tree of ${dir} and tell me which file lives inside the sub folder.`,
      expect: /c\.txt/,
    },
    {
      id: 'search_files',
      tool: 'search_files',
      args: { path: dir, pattern: 'c.txt' },
      prompt: `Search ${dir} for a file called c.txt and tell me which folder it is in.`,
      expect: /\bsub\b/i,
    },
    {
      id: 'get_file_info',
      tool: 'get_file_info',
      args: { path: join(dir, 'a.txt') },
      prompt: `What is the size in bytes of ${join(dir, 'a.txt')}? Reply with one short sentence.`,
      expect: /\b10\b/,
    },
    {
      id: 'write_file',
      tool: 'write_file',
      args: { path: join(dir, 'out.txt'), content: 'written-4821' },
      prompt: `Write the text written-4821 to the file ${join(dir, 'out.txt')}, then reply with one short sentence.`,
      async check() {
        const p = join(dir, 'out.txt');
        if (!existsSync(p)) return { pass: false, detail: 'out.txt missing' };
        const got = readFileSync(p, 'utf8').trim();
        return got === 'written-4821' ? { pass: true, detail: 'ok' } : { pass: false, detail: `out.txt contains ${JSON.stringify(got.slice(0, 40))}` };
      },
    },
    { id: 'append_file', tool: 'append_file', args: { path: join(dir, 'log.txt'), content: 'line\n' } },
    {
      id: 'edit_file',
      tool: 'edit_file',
      // The latency run uses dryRun so it can repeat; the model-driven prompt makes the real edit.
      args: { path: join(dir, 'edit.txt'), edits: [{ oldText: 'AAA', newText: 'BBB' }], dryRun: true },
      prompt: `In the file ${join(dir, 'edit.txt')} replace the word AAA with BBB, then reply with one short sentence.`,
      async check() {
        const got = readFileSync(join(dir, 'edit.txt'), 'utf8').trim();
        return got === 'status: BBB' ? { pass: true, detail: 'ok' } : { pass: false, detail: `edit.txt contains ${JSON.stringify(got.slice(0, 40))}` };
      },
    },
    {
      id: 'create_directory',
      tool: 'create_directory',
      args: { path: join(dir, 'made', 'deep') },
      prompt: `Create the folder ${join(dir, 'made', 'deep')} (including any parent folders), then reply with one short sentence.`,
      async check() {
        return existsSync(join(dir, 'made', 'deep')) ? { pass: true, detail: 'ok' } : { pass: false, detail: 'folder missing' };
      },
    },
  ],
  skipped: [
    { tool: 'read_file', reason: 'Deprecated alias of read_text_file.' },
    { tool: 'read_media_file', reason: 'Needs an image or audio file; the result is binary data.' },
    { tool: 'move_file', reason: 'Not repeatable: the source is gone after the first call. Covered by the organize scenario.' },
    { tool: 'copy_file', reason: 'Not repeatable: the destination exists after the first call.' },
  ],
};
