// One-off: move the old per-variant result folders into the one-folder-per-service layout.
//
//   node bench/legacy/migrate.ts --dry          show what would happen, change nothing
//   node bench/legacy/migrate.ts                do it
//   node bench/legacy/migrate.ts --root <dir>   operate on a copy of bench/ (for testing)
//
// Old folder            ->  new folder / variant
//   blender             ->  blender   / scenarios
//   blender-calls       ->  blender   / calls
//   windows-full        ->  windows   / scenarios          (all 20 tools)
//   windows             ->  windows   / scenarios-4-tools  (FileSystem,PowerShell,Process,Wait)
//   windows-calls       ->  windows   / calls
//
// For each of results/ and results-archive/** the .jsonl records get a `variant` field (records that already
// have one are left alone), and files that live in an old folder are moved to the service folder. Nothing is
// deleted except the emptied old folders and the generated CALLS.md / RESULTS.md files of the old layout
// (rebuild with `npm run bench:report`; `npm run bench:calls` writes the new calls-latest.json).
// Safe to run twice: a second run finds nothing to do. Stop any running benchmark first.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    dry: { type: 'boolean', default: false },
    root: { type: 'string', default: resolve(dirname(fileURLToPath(import.meta.url)), '..') },
  },
});
const root = values.root;
const dry = values.dry;

interface Mapping {
  from: string;
  to: string;
  variant: string;
}
const mappings: Mapping[] = [
  { from: 'blender', to: join('suites', 'blender'), variant: 'scenarios' },
  { from: 'blender-calls', to: join('suites', 'blender'), variant: 'calls' },
  { from: 'windows-full', to: join('suites', 'windows'), variant: 'scenarios' },
  { from: 'windows', to: join('suites', 'windows'), variant: 'scenarios-4-tools' },
  { from: 'windows-calls', to: join('suites', 'windows'), variant: 'calls' },
];

let actions = 0;
const say = (msg: string): void => {
  actions++;
  console.log(`${dry ? '[dry] ' : ''}${msg}`);
};

/** Add `variant` to every record that lacks one; other lines are kept byte for byte. */
function tagJsonl(text: string, variant: string): { text: string; tagged: number } {
  let tagged = 0;
  const lines = text.split('\n').map((line, i) => {
    const bom = i === 0 && line.startsWith('﻿') ? '﻿' : '';
    const body = line.slice(bom.length);
    if (!body.trim()) return line;
    const rec = JSON.parse(body) as Record<string, unknown>;
    if ('variant' in rec) return line;
    tagged++;
    const { batch, ...rest } = rec;
    return bom + JSON.stringify(batch === undefined ? { variant, ...rest } : { batch, variant, ...rest });
  });
  return { text: lines.join('\n'), tagged };
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function removeEmptyDirs(dir: string): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) removeEmptyDirs(p);
  }
  if (readdirSync(dir).length === 0) {
    say(`rmdir ${relative(root, dir)}`);
    if (!dry) rmdirSync(dir);
  }
}

function migrate(m: Mapping): void {
  const inPlace = m.from === m.to;
  const src = join(root, m.from);
  if (!existsSync(src)) return;
  for (const sub of ['results', 'results-archive']) {
    for (const file of listFiles(join(src, sub))) {
      const rel = relative(src, file);
      const isJsonl = file.endsWith('.jsonl');
      const original = readFileSync(file, 'utf8');
      const { text, tagged } = isJsonl ? tagJsonl(original, m.variant) : { text: original, tagged: 0 };
      let dest = join(root, m.to, rel);
      if (inPlace) {
        if (tagged > 0) {
          say(`tag ${relative(root, file)}: variant=${m.variant} on ${tagged} records`);
          if (!dry) writeFileSync(file, text);
        }
        continue;
      }
      if (existsSync(dest)) {
        if (readFileSync(dest, 'utf8') === text) {
          say(`${relative(root, file)} already present at ${relative(root, dest)}: removing the duplicate`);
          if (!dry) unlinkSync(file);
          continue;
        }
        // Different content under the same name (same batch timestamp): keep both.
        dest = dest.replace(/(\.[^.\\/]+)$/, `.${m.variant}$1`);
        if (existsSync(dest) && readFileSync(dest, 'utf8') !== text) {
          console.error(`SKIP ${relative(root, file)}: ${relative(root, dest)} exists with different content`);
          continue;
        }
      }
      say(`move ${relative(root, file)} -> ${relative(root, dest)}${tagged ? ` (variant=${m.variant} on ${tagged} records)` : ''}`);
      if (dry) continue;
      mkdirSync(dirname(dest), { recursive: true });
      if (tagged === 0) {
        renameSync(file, dest);
      } else {
        writeFileSync(dest, text);
        if (readFileSync(dest, 'utf8') !== text) throw new Error(`write verification failed for ${dest}`);
        unlinkSync(file);
      }
    }
  }
  // Generated files of the old layout. Rebuilt by `npm run bench:report` / `npm run bench:calls`.
  for (const gen of ['CALLS.md', 'RESULTS.md']) {
    const p = join(src, gen);
    if (existsSync(p)) {
      say(`delete generated ${relative(root, p)}`);
      if (!dry) unlinkSync(p);
    }
  }
  if (!inPlace) {
    const isData = (f: string): boolean => /^(results|results-archive)[\\/]/.test(relative(src, f)) || ['CALLS.md', 'RESULTS.md'].includes(relative(src, f));
    if (!dry) removeEmptyDirs(src);
    const leftover = (dry ? listFiles(src).filter((f) => !isData(f)) : listFiles(src)).map((f) => relative(src, f));
    if (dry && leftover.length === 0) say(`rmdir ${m.from}/ once emptied`);
    if (leftover.length > 0) console.warn(`NOTE ${m.from}/ keeps files that are not results: ${leftover.join(', ')}`);
  }
}

for (const m of mappings) migrate(m);
console.log(actions === 0 ? 'Nothing to do (already migrated).' : `${dry ? 'Would make' : 'Made'} ${actions} change(s).${dry ? '' : ' Now run: npm run bench:report'}`);
