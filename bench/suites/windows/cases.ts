import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { CallDef } from '../../lib/types/index.ts';
import { SANDBOX } from './tasks.ts';

const dir = `${SANDBOX}-calls`;

function runningProcessNames(): string[] {
  const csv = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  return [...new Set(csv.split(/\r?\n/).map((l) => (l.split('","')[0] ?? '').replace(/^"/, '').replace(/\.exe$/i, '').toLowerCase()))].filter(
    (n) => n.length >= 4,
  );
}

/**
 * Windows-MCP, benchmarked per tool call against all 20 tools. Only read-only or sandbox-confined calls are covered;
 * anything that touches the screen, input devices, the clipboard or the network is skipped on purpose.
 */
export const windowsCalls: CallDef = {
  async reset() {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}\\a.txt`, 'hello-4821');
    writeFileSync(`${dir}\\b.txt`, 'second file');
    writeFileSync(`${dir}\\c.txt`, 'third file');
  },
  cases: [
    {
      id: 'PowerShell',
      tool: 'PowerShell',
      args: { command: 'Write-Output codemode-ok-4821' },
      prompt: 'Run a PowerShell command that prints codemode-ok-4821 and tell me exactly what it printed.',
      expect: /codemode-ok-4821/,
    },
    {
      id: 'FileSystem.list',
      tool: 'FileSystem',
      args: { mode: 'list', path: dir },
      prompt: `List the files in ${dir} and reply with their names in one short sentence.`,
      async check(answer) {
        const missing = ['a.txt', 'b.txt', 'c.txt'].filter((n) => !answer.includes(n));
        return missing.length === 0 ? { pass: true, detail: 'ok' } : { pass: false, detail: `answer lacks ${missing.join(', ')}` };
      },
    },
    {
      id: 'FileSystem.read',
      tool: 'FileSystem',
      args: { mode: 'read', path: `${dir}\\a.txt` },
      prompt: `Read the file ${dir}\\a.txt and tell me exactly what it contains.`,
      expect: /hello-4821/,
    },
    {
      id: 'FileSystem.write',
      tool: 'FileSystem',
      args: { mode: 'write', path: `${dir}\\out.txt`, content: 'written-4821', overwrite: true },
      prompt: `Write the text written-4821 to the file ${dir}\\out.txt (replace it if it exists), then reply with one short sentence.`,
      async check() {
        const p = `${dir}\\out.txt`;
        if (!existsSync(p)) return { pass: false, detail: 'out.txt missing' };
        const got = readFileSync(p, 'utf8').trim();
        return got === 'written-4821' ? { pass: true, detail: 'ok' } : { pass: false, detail: `out.txt contains ${JSON.stringify(got.slice(0, 40))}` };
      },
    },
    {
      id: 'Process.list',
      tool: 'Process',
      args: { mode: 'list', sort_by: 'memory', limit: 5 },
      prompt: 'List the five processes using the most memory right now, names only, in one short sentence.',
      async check(answer) {
        const lower = answer.toLowerCase();
        const hits = runningProcessNames().filter((n) => lower.includes(n));
        return hits.length >= 3 ? { pass: true, detail: 'ok' } : { pass: false, detail: `only ${hits.length} real process names in answer` };
      },
    },
    {
      id: 'Registry.get',
      tool: 'Registry',
      args: { mode: 'get', path: 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', name: 'ProductName' },
      prompt: 'Read the ProductName value of the registry key HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion and tell me it in one short sentence.',
      expect: /Windows/i,
    },
    {
      id: 'Wait',
      tool: 'Wait',
      args: { duration: 1 },
      prompt: 'Wait for 1 second, then reply with the single word done.',
      expect: /done/i,
    },
    // Reads display layout only; no model prompt (the answer depends on this particular PC).
    { id: 'DisplayInventory', tool: 'DisplayInventory', args: {} },
  ],
  skipped: [
    { tool: 'App', reason: 'Launches programs and moves windows on your desktop.' },
    { tool: 'Snapshot', reason: 'Captures your screen and UI tree; the image would be sent to the model.' },
    { tool: 'Screenshot', reason: 'Captures your screen; the image would be sent to the model.' },
    { tool: 'Click', reason: 'Sends mouse input to your desktop.' },
    { tool: 'Type', reason: 'Sends keystrokes to your desktop.' },
    { tool: 'Scroll', reason: 'Sends mouse input to your desktop.' },
    { tool: 'Move', reason: 'Moves the mouse on your desktop.' },
    { tool: 'Shortcut', reason: 'Sends key combinations to whatever window has focus.' },
    { tool: 'MultiSelect', reason: 'Sends mouse input to your desktop.' },
    { tool: 'MultiEdit', reason: 'Sends keystrokes to your desktop.' },
    { tool: 'Clipboard', reason: 'Reads your clipboard, which can hold private data.' },
    { tool: 'Notification', reason: 'Pops a visible toast notification on your desktop.' },
    { tool: 'Scrape', reason: 'Fetches an external web page; latency depends on the network, not on the tool.' },
    { tool: 'WaitFor', reason: 'Needs a live UI condition to wait on.' },
  ],
};
