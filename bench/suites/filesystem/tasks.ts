import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Task } from '../../lib/types/index.ts';
import { fail, freshDir, lcg, lines, ok, readText } from '../../lib/testkit.ts';

/**
 * Every task works only inside this folder, which the harness wipes and recreates before each run.
 *
 * It lives inside the benchmark's working directory (`bench/work/`, git-ignored) on purpose. Claude Code announces
 * its working directory to MCP servers as a "root", and the Filesystem server then allows that root INSTEAD of the
 * directories on its command line. A sandbox anywhere else would be reachable by the codemode path (our own client
 * sends no roots) but not by the direct path, and the comparison would silently measure refusals.
 */
export const SANDBOX = fileURLToPath(new URL('../../work/fs-sandbox', import.meta.url)).replace(/[\\/]+$/, '');


export function makeTasks(dir: string): Task[] {
  // ---- notes-index: create a small tree with exact contents ---------------------------------------------------
  const notesIndex: Task = {
    id: 'notes-index',
    seeded: false,
    prompt:
      `Work only inside ${dir}. Create the folder notes/2026 there. Inside it create three Markdown files note_1.md, note_2.md and note_3.md, ` +
      'where note_N.md contains exactly two lines: "# Note N" and then "Body N" (N is its number). ' +
      'Also create notes/INDEX.md with one line per note, in order, in the form "- [Note N](2026/note_N.md)". Then reply with one short sentence.',
    async prepare() {
      freshDir(dir);
    },
    async verify() {
      for (let n = 1; n <= 3; n++) {
        const p = join(dir, 'notes', '2026', `note_${n}.md`);
        if (!existsSync(p)) return fail(`note_${n}.md missing`);
        const got = lines(readText(p)).join('|');
        if (got !== `# Note ${n}|Body ${n}`) return fail(`note_${n}.md is ${JSON.stringify(got.slice(0, 60))}`);
      }
      const index = join(dir, 'notes', 'INDEX.md');
      if (!existsSync(index)) return fail('INDEX.md missing');
      const got = lines(readText(index)).join('|');
      const want = [1, 2, 3].map((n) => `- [Note ${n}](2026/note_${n}.md)`).join('|');
      return got === want ? ok : fail(`INDEX.md is ${JSON.stringify(got.slice(0, 120))}`);
    },
  };

  // ---- log-triage: read a lot of text, report a few numbers (the case code mode is built for) -------------------
  const rnd = lcg(31337);
  const logs: { name: string; errors: number; warnings: number; text: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const rows: string[] = [];
    let errors = 0;
    let warnings = 0;
    const extraErrors = i === 13 ? 9 : 0; // exactly one file is the clear maximum
    for (let r = 0; r < 60; r++) {
      const x = rnd();
      const level = x < 0.08 ? 'ERROR' : x < 0.2 ? 'WARN' : 'INFO';
      if (level === 'ERROR') errors++;
      if (level === 'WARN') warnings++;
      rows.push(`2026-11-22T10:${String(r).padStart(2, '0')}:00Z ${level} worker-${i} request ${1000 + r} handled in ${10 + Math.floor(rnd() * 90)}ms`);
    }
    for (let e = 0; e < extraErrors; e++) {
      rows[e * 6] = `2026-11-22T10:${String(e * 6).padStart(2, '0')}:00Z ERROR worker-${i} upstream timeout after 30000ms`;
      errors++;
    }
    logs.push({ name: `app_${String(i).padStart(2, '0')}.log`, errors, warnings, text: `${rows.join('\n')}\n` });
  }
  // Recount from the final text so the expected values can never drift from the files.
  for (const f of logs) {
    f.errors = f.text.split('\n').filter((l) => l.includes(' ERROR ')).length;
    f.warnings = f.text.split('\n').filter((l) => l.includes(' WARN ')).length;
  }
  const ranked = [...logs].sort((a, b) => b.errors - a.errors || a.name.localeCompare(b.name));
  const topLog = ranked[0]?.name ?? '';
  const logTriage: Task = {
    id: 'log-triage',
    seeded: true,
    prompt:
      `Work only inside ${dir}, which holds 20 log files named app_NN.log. Write ${join(dir, 'summary.csv')} with the header line "file,errors,warnings" ` +
      'and then one line per log file giving its name, the number of lines containing " ERROR " and the number containing " WARN ", ' +
      'sorted by errors, most first, ties by file name A to Z. Reply with one short sentence that names the file with the most errors.',
    async prepare() {
      freshDir(dir);
      for (const f of logs) writeFileSync(join(dir, f.name), f.text);
    },
    async verify(answer) {
      const p = join(dir, 'summary.csv');
      if (!existsSync(p)) return fail('summary.csv missing');
      const got = lines(readText(p));
      const want = ['file,errors,warnings', ...ranked.map((f) => `${f.name},${f.errors},${f.warnings}`)];
      if (got.length !== want.length) return fail(`csv has ${got.length} lines, want ${want.length}`);
      for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) return fail(`line ${i + 1}: ${got[i]} want ${want[i]}`);
      return answer.includes(topLog) ? ok : fail(`answer lacks ${topLog}: ${answer.slice(0, 80)}`);
    },
  };

  // ---- organize: many moves ------------------------------------------------------------------------------------
  const rnd2 = lcg(4242);
  const exts = ['jpg', 'png', 'pdf', 'docx', 'txt'];
  const messy: { name: string; ext: string; bytes: number }[] = [];
  for (let i = 1; i <= 40; i++) {
    const ext = exts[Math.floor(rnd2() * exts.length)] as string;
    messy.push({ name: `doc_${String(i).padStart(2, '0')}.${ext}`, ext, bytes: 10 + i });
  }
  const organize: Task = {
    id: 'organize',
    seeded: true,
    prompt:
      `Work only inside ${dir}, which holds 40 loose files of several types. Move every file into a subfolder named after its extension in upper case ` +
      '(for example photo.jpg goes into JPG), creating the folders as needed. Do not delete or rename anything. ' +
      'Reply with one short sentence giving the number of files you moved.',
    async prepare() {
      freshDir(dir);
      for (const f of messy) writeFileSync(join(dir, f.name), 'y'.repeat(f.bytes));
    },
    async verify(answer) {
      const top = readdirSync(dir, { withFileTypes: true });
      const loose = top.filter((e) => e.isFile()).map((e) => e.name);
      if (loose.length > 0) return fail(`${loose.length} files still loose, e.g. ${loose[0]}`);
      const want = new Set(messy.map((f) => f.ext.toUpperCase()));
      for (const e of top.filter((x) => x.isDirectory())) if (!want.has(e.name)) return fail(`unexpected folder ${e.name}`);
      for (const f of messy) {
        const p = join(dir, f.ext.toUpperCase(), f.name);
        if (!existsSync(p)) return fail(`${f.name} not in ${f.ext.toUpperCase()}`);
        if (statSync(p).size !== f.bytes) return fail(`${f.name} size changed`);
      }
      return /\b40\b|forty/i.test(answer) ? ok : fail(`answer lacks count 40: ${answer.slice(0, 80)}`);
    },
  };

  // ---- retries: find-and-edit across nested files, touching only some ----------------------------------------
  const cfg: { rel: string[]; before: string; after: string; changed: boolean }[] = [];
  const rnd3 = lcg(99);
  for (let i = 1; i <= 15; i++) {
    const folder = i % 3 === 0 ? ['services', 'edge'] : i % 3 === 1 ? ['services'] : ['jobs', 'nightly'];
    const retries = rnd3() < 0.6 ? 3 : 2;
    const text = `# service ${i}\nname=svc_${i}\ntimeout_ms=${1000 + i * 50}\nretries=${retries}\nlog_level=info\n`;
    cfg.push({
      rel: [...folder, `svc_${String(i).padStart(2, '0')}.cfg`],
      before: text,
      after: retries === 3 ? text.replace('retries=3', 'retries=5') : text,
      changed: retries === 3,
    });
  }
  const changedCount = cfg.filter((c) => c.changed).length;
  const retries: Task = {
    id: 'retries',
    seeded: true,
    prompt:
      `Work only inside ${dir}, which holds a tree of .cfg files in nested folders. In every .cfg file whose line reads exactly "retries=3", ` +
      'change that line to "retries=5". Files with any other retries value must stay exactly as they are. ' +
      'Reply with one short sentence giving the number of files you changed.',
    async prepare() {
      freshDir(dir);
      for (const c of cfg) {
        mkdirSync(join(dir, ...c.rel.slice(0, -1)), { recursive: true });
        writeFileSync(join(dir, ...c.rel), c.before);
      }
    },
    async verify(answer) {
      for (const c of cfg) {
        const p = join(dir, ...c.rel);
        if (!existsSync(p)) return fail(`${c.rel.join('/')} missing`);
        if (readText(p) !== c.after) return fail(`${c.rel.join('/')} has the wrong content`);
      }
      return new RegExp(`\\b${changedCount}\\b`).test(answer) ? ok : fail(`answer lacks count ${changedCount}: ${answer.slice(0, 80)}`);
    },
  };

  return [notesIndex, logTriage, organize, retries];
}
