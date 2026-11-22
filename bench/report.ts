import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ClaudeRun, PathId } from './claude.ts';

export interface RunRecord {
  batch: string;
  task: string;
  model: string;
  repeat: number;
  pass: boolean;
  verdict: string;
  run: ClaudeRun;
}

const resultsDir = fileURLToPath(new URL('./results/', import.meta.url));
const reportFile = fileURLToPath(new URL('./RESULTS.md', import.meta.url));

export function saveRecord(rec: RunRecord): void {
  appendFileSync(`${resultsDir}${rec.batch}.jsonl`, `${JSON.stringify(rec)}\n`);
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
const total = (r: ClaudeRun): number => r.usage.input + r.usage.cacheWrite + r.usage.cacheRead + r.usage.output;

function row(label: string, recs: RunRecord[]): string {
  if (recs.length === 0) return `| ${label} | - | - | - | - | - | - | - | - | - | - |`;
  const f = (g: (r: RunRecord) => number): number => mean(recs.map(g));
  const passes = recs.filter((r) => r.pass).length;
  return (
    `| ${label} | ${passes}/${recs.length} | ${f((r) => r.run.turns).toFixed(1)} | ${f((r) => r.run.toolCalls).toFixed(1)} ` +
    `| ${fmt(f((r) => r.run.firstTurnContext))} | ${fmt(f((r) => r.run.usage.output))} ` +
    `| ${fmt(f((r) => r.run.usage.input + r.run.usage.cacheWrite))} | ${fmt(f((r) => r.run.usage.cacheRead))} ` +
    `| ${fmt(f((r) => total(r.run)))} | $${f((r) => r.run.costUsd).toFixed(3)} | ${(f((r) => r.run.durationMs) / 1000).toFixed(1)}s |`
  );
}

const header =
  '| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |\n' +
  '|---|---|---|---|---|---|---|---|---|---|---|';

export function buildReport(): string {
  const records: RunRecord[] = [];
  if (existsSync(resultsDir)) {
    for (const f of readdirSync(resultsDir).filter((n) => n.endsWith('.jsonl')).sort()) {
      for (const line of readFileSync(`${resultsDir}${f}`, 'utf8').split('\n')) {
        if (line.trim()) records.push(JSON.parse(line) as RunRecord);
      }
    }
  }
  const models = [...new Set(records.map((r) => r.model))];
  const taskIds = [...new Set(records.map((r) => r.task))];
  const paths: PathId[] = ['direct', 'codemode'];
  const out: string[] = [
    '# Benchmark: direct blender-mcp vs codemode',
    '',
    'Both paths drive the same live Blender through the same upstream (`blender-mcp`), with the same model, the same prompt, built-in tools disabled, and the scene reset before every run.',
    'Numbers are means over runs. `Pass` is an objective check of the resulting scene (positions, sizes, names, materials), not the model\'s own claim.',
    'Reproduce: `npm run bench -- --runs 3`.',
    '',
  ];
  for (const model of models) {
    const mr = records.filter((r) => r.model === model);
    out.push(`## Model: \`${model}\``, '');
    for (const t of taskIds) {
      const tr = mr.filter((r) => r.task === t);
      if (tr.length === 0) continue;
      out.push(`### Task: ${t}`, '', header);
      for (const p of paths) out.push(row(p, tr.filter((r) => r.run.path === p)));
      out.push('');
    }
    out.push('### All tasks', '', header);
    const sums: Record<string, number> = {};
    for (const p of paths) {
      const pr = mr.filter((r) => r.run.path === p);
      out.push(row(p, pr));
      sums[p] = mean(pr.map((r) => total(r.run)));
    }
    const d = sums['direct'] ?? 0;
    const c = sums['codemode'] ?? 0;
    if (d > 0 && c > 0) {
      out.push('', `Total tokens, codemode vs direct: **${(((c - d) / d) * 100).toFixed(0)}%** (${fmt(c)} vs ${fmt(d)}).`);
    }
    const t = (p: PathId): number => mean(mr.filter((r) => r.run.path === p).map((r) => r.run.durationMs)) / 1000;
    if (t('direct') > 0 && t('codemode') > 0) {
      out.push(
        '',
        `Wall time, codemode vs direct: **${(((t('codemode') - t('direct')) / t('direct')) * 100).toFixed(0)}%** (${t('codemode').toFixed(1)}s vs ${t('direct').toFixed(1)}s). ` +
          'Wall time covers the whole headless run: MCP server start-up, model latency per turn, and Blender execution.',
      );
    }
    out.push('');
  }
  out.push(
    '## How to read this',
    '',
    '- Most of the token saving comes from tool definitions: direct sends ten Blender tool schemas on every turn, codemode sends one (see "First-turn context").',
    '- In both paths the model mostly used the same underlying tool (run Python in Blender), so these tasks do not exercise chaining several different upstream tools in one script. That is where codemode should help most, and it is not measured here.',
    '- The asset libraries in the test Blender were switched off, so search/import tasks (non-deterministic and network-bound) are not included.',
    '- The typed `codemode.*` API lives in the tool description. Claude Code may shorten long MCP tool descriptions; this has not been verified here, and the model may have seen only part of the API.',
    '- 3 runs per task and path, one model, one machine: treat small differences (especially wall time) as noise.',
    '',
  );
  const failures = records.filter((r) => !r.pass);
  if (failures.length) {
    out.push('## Failed runs', '', '| Task | Path | Repeat | Reason |', '|---|---|---|---|');
    for (const r of failures) out.push(`| ${r.task} | ${r.run.path} | ${r.repeat} | ${(r.run.error ?? r.verdict).replace(/\|/g, '/').slice(0, 120)} |`);
    out.push('');
  }
  return out.join('\n');
}

export function writeReport(): string {
  const md = buildReport();
  writeFileSync(reportFile, md);
  return reportFile;
}

if (import.meta.main) console.log(`Wrote ${writeReport()}`);
