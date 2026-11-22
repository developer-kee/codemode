import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Task, Verdict } from '../lib/types.ts';

/** Every task works only inside this folder; the harness wipes and recreates it before each run. */
export const SANDBOX = `${tmpdir()}\\codemode-bench-windows`;

const fail = (detail: string): Verdict => ({ pass: false, detail });
const ok: Verdict = { pass: true, detail: 'ok' };
const lines = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
const readText = (p: string): string => readFileSync(p, 'utf8').replace(/^﻿/, '');
const freshDir = (dir: string): void => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
};

/** Deterministic pseudo-random sequence so every run sees identical files. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export function makeTasks(dir: string): Task[] {
  // ---- files: create a small tree with exact contents -----------------------------------------
  const files: Task = {
    id: 'files',
    seeded: false,
    prompt:
      `Work only inside ${dir}. Create the folder report\\2026 there. Inside it create four text files Q1.txt, Q2.txt, Q3.txt and Q4.txt, ` +
      'where each file contains exactly the text "Quarter N" with N being its quarter number (1 to 4). ' +
      'Also create report\\README.txt containing the four file names, one per line, in order. Then reply with one short sentence.',
    async prepare() {
      freshDir(dir);
    },
    async verify() {
      for (let n = 1; n <= 4; n++) {
        const p = `${dir}\\report\\2026\\Q${n}.txt`;
        if (!existsSync(p)) return fail(`Q${n}.txt missing`);
        if (readText(p).trim() !== `Quarter ${n}`) return fail(`Q${n}.txt content ${JSON.stringify(readText(p).slice(0, 40))}`);
      }
      const readme = `${dir}\\report\\README.txt`;
      if (!existsSync(readme)) return fail('README.txt missing');
      const got = lines(readText(readme)).join('|');
      return got === 'Q1.txt|Q2.txt|Q3.txt|Q4.txt' ? ok : fail(`README lines ${got}`);
    },
  };

  // ---- inventory: read file metadata, compute, write a CSV, report a total ---------------------
  const rnd1 = lcg(777);
  const inv: { name: string; bytes: number }[] = [];
  for (let i = 1; i <= 30; i++) {
    const ext = ['log', 'txt', 'csv'][i % 3] as string;
    inv.push({ name: `file_${String(i).padStart(2, '0')}.${ext}`, bytes: 50 + Math.floor(rnd1() * 40) * 25 });
  }
  const logs = inv.filter((f) => f.name.endsWith('.log')).sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  const logTotal = logs.reduce((n, f) => n + f.bytes, 0);
  const inventory: Task = {
    id: 'inventory',
    seeded: true,
    prompt:
      `Work only inside ${dir}, which holds 30 files of several types. Write ${dir}\\logs.csv containing a header line "name,bytes" ` +
      'followed by one line per .log file (name and its size in bytes), sorted by size, largest first, ties by name A to Z. ' +
      'Reply with one short sentence giving the total size in bytes of all the .log files.',
    async prepare() {
      freshDir(dir);
      for (const f of inv) writeFileSync(`${dir}\\${f.name}`, 'x'.repeat(f.bytes));
    },
    async verify(answer) {
      const p = `${dir}\\logs.csv`;
      if (!existsSync(p)) return fail('logs.csv missing');
      const got = lines(readText(p));
      const want = ['name,bytes', ...logs.map((f) => `${f.name},${f.bytes}`)];
      if (got.length !== want.length) return fail(`csv has ${got.length} lines, want ${want.length}`);
      for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) return fail(`line ${i + 1}: ${got[i]} want ${want[i]}`);
      return new RegExp(`(^|[^\\d])${logTotal}([^\\d]|$)`).test(answer.replace(/,/g, ''))
        ? ok
        : fail(`answer lacks total ${logTotal}: ${answer.slice(0, 80)}`);
    },
  };

  // ---- organize: move many files into folders by extension -------------------------------------
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
      for (const f of messy) writeFileSync(`${dir}\\${f.name}`, 'y'.repeat(f.bytes));
    },
    async verify(answer) {
      const top = readdirSync(dir, { withFileTypes: true });
      const loose = top.filter((e) => e.isFile()).map((e) => e.name);
      if (loose.length > 0) return fail(`${loose.length} files still loose, e.g. ${loose[0]}`);
      const want = new Set(messy.map((f) => f.ext.toUpperCase()));
      const folders = top.filter((e) => e.isDirectory()).map((e) => e.name);
      for (const f of folders) if (!want.has(f)) return fail(`unexpected folder ${f}`);
      for (const f of messy) {
        const p = `${dir}\\${f.ext.toUpperCase()}\\${f.name}`;
        if (!existsSync(p)) return fail(`${f.name} not in ${f.ext.toUpperCase()}`);
        if (statSync(p).size !== f.bytes) return fail(`${f.name} size changed`);
      }
      return /\b40\b|forty/i.test(answer) ? ok : fail(`answer lacks count 40: ${answer.slice(0, 80)}`);
    },
  };

  return [files, inventory, organize];
}
