import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ClaudeRun, PathId } from './claude.ts';
import type { BenchService } from './types.ts';

export interface RunRecord {
  batch: string;
  task: string;
  model: string;
  repeat: number;
  pass: boolean;
  verdict: string;
  /** Git revision of this repo when the run was made, so results can be tied to the wrapper design. */
  rev?: string;
  run: ClaudeRun;
}

const benchRoot = fileURLToPath(new URL('../', import.meta.url));
export const resultsDir = (serviceId: string): string => `${benchRoot}${serviceId}/results/`;
const reportFile = (serviceId: string): string => `${benchRoot}${serviceId}/RESULTS.md`;
const overviewFile = `${benchRoot}RESULTS.md`;

export function saveRecord(serviceId: string, rec: RunRecord): void {
  mkdirSync(resultsDir(serviceId), { recursive: true });
  appendFileSync(`${resultsDir(serviceId)}${rec.batch}.jsonl`, `${JSON.stringify(rec)}\n`);
}

export function loadRecords(serviceId: string): RunRecord[] {
  const dir = resultsDir(serviceId);
  const records: RunRecord[] = [];
  if (!existsSync(dir)) return records;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort()) {
    for (const line of readFileSync(`${dir}${f}`, 'utf8').split('\n')) {
      if (line.trim()) records.push(JSON.parse(line) as RunRecord);
    }
  }
  return records;
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
const total = (r: ClaudeRun): number => r.usage.input + r.usage.cacheWrite + r.usage.cacheRead + r.usage.output;
const pct = (from: number, to: number): string => `${(((to - from) / from) * 100).toFixed(0)}%`;

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

const paths: PathId[] = ['direct', 'codemode'];

function summary(recs: RunRecord[]): { d: number; c: number; dt: number; ct: number } {
  const of = (p: PathId, g: (r: RunRecord) => number): number => mean(recs.filter((r) => r.run.path === p).map(g));
  return {
    d: of('direct', (r) => total(r.run)),
    c: of('codemode', (r) => total(r.run)),
    dt: of('direct', (r) => r.run.durationMs) / 1000,
    ct: of('codemode', (r) => r.run.durationMs) / 1000,
  };
}

export function buildServiceReport(service: BenchService): string {
  const records = loadRecords(service.id);
  const models = [...new Set(records.map((r) => r.model))];
  const out: string[] = [
    `# Benchmark: ${service.title}, direct MCP vs codemode`,
    '',
    ...service.notes.map((n) => `- ${n}`),
    '',
    'Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model\'s own claim.',
    `Reproduce: \`npm run bench -- --service ${service.id} --runs 3\`. Method, metric definitions and limitations: [../README.md](../README.md).`,
    '',
    `> **Warning:** ${service.warning}`,
    '',
  ];
  if (records.length === 0) out.push('_No runs recorded yet._', '');
  for (const model of models) {
    const mr = records.filter((r) => r.model === model);
    out.push(`## Model: \`${model}\``, '');
    // One row per task: no single task can hide inside the averages below.
    const taskIds = service.tasks.filter((t) => mr.some((r) => r.task === t.id));
    if (taskIds.length > 1) {
      out.push(
        '### Per-task summary',
        '',
        '| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |',
        '|---|---|---|---|---|---|---|---|---|---|',
      );
      const deltas: { id: string; tok: number }[] = [];
      for (const t of taskIds) {
        const tr = mr.filter((r) => r.task === t.id);
        const d = tr.filter((r) => r.run.path === 'direct');
        const c = tr.filter((r) => r.run.path === 'codemode');
        if (d.length === 0 || c.length === 0) continue;
        const dTok = mean(d.map((r) => total(r.run)));
        const cTok = mean(c.map((r) => total(r.run)));
        const dMs = mean(d.map((r) => r.run.durationMs)) / 1000;
        const cMs = mean(c.map((r) => r.run.durationMs)) / 1000;
        deltas.push({ id: t.id, tok: ((cTok - dTok) / dTok) * 100 });
        out.push(
          `| ${t.id} | ${d.filter((r) => r.pass).length}/${d.length} / ${c.filter((r) => r.pass).length}/${c.length} ` +
            `| ${fmt(dTok)} | ${fmt(cTok)} | **${pct(dTok, cTok)}** | ${dMs.toFixed(1)}s | ${cMs.toFixed(1)}s | **${pct(dMs, cMs)}** ` +
            `| $${mean(d.map((r) => r.run.costUsd)).toFixed(3)} | $${mean(c.map((r) => r.run.costUsd)).toFixed(3)} |`,
        );
      }
      if (deltas.length > 1) {
        const best = deltas.reduce((a, b) => (b.tok < a.tok ? b : a));
        const worst = deltas.reduce((a, b) => (b.tok > a.tok ? b : a));
        out.push('', `Token change ranges from **${best.tok.toFixed(0)}%** (${best.id}) to **${worst.tok.toFixed(0)}%** (${worst.id}).`);
      }
      out.push('');
    }
    for (const task of service.tasks) {
      const tr = mr.filter((r) => r.task === task.id);
      if (tr.length === 0) continue;
      out.push(`### Task: ${task.id}`, '', header);
      for (const p of paths) out.push(row(p, tr.filter((r) => r.run.path === p)));
      out.push('');
    }
    out.push('### All tasks', '', header);
    for (const p of paths) out.push(row(p, mr.filter((r) => r.run.path === p)));
    const s = summary(mr);
    if (s.d > 0 && s.c > 0) {
      out.push(
        '',
        `Total tokens, codemode vs direct: **${pct(s.d, s.c)}** (${fmt(s.c)} vs ${fmt(s.d)}).`,
        '',
        `Wall time, codemode vs direct: **${pct(s.dt, s.ct)}** (${s.ct.toFixed(1)}s vs ${s.dt.toFixed(1)}s). ` +
          'Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool\'s own execution.',
      );
    }
    out.push('');
  }
  out.push(
    '## Task prompts',
    '',
    'Identical text is sent on both paths.',
    '',
    ...service.tasks.map((t) => `- **${t.id}**${t.seeded ? ' (pre-seeded)' : ''}: ${t.prompt}`),
    '',
  );
  const failures = records.filter((r) => !r.pass);
  if (failures.length) {
    out.push('## Failed runs', '', '| Task | Path | Repeat | Reason |', '|---|---|---|---|');
    for (const r of failures) {
      out.push(`| ${r.task} | ${r.run.path} | ${r.repeat} | ${(r.run.error ?? r.verdict).replace(/\|/g, '/').slice(0, 120)} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

export function buildOverview(all: BenchService[]): string {
  const out: string[] = [
    '# Benchmarks by tool',
    '',
    'Each tool is benchmarked separately: the same model, prompts and checks on two paths, the upstream MCP server used directly versus the same server behind codemode (`execute_code`).',
    'Method, metric definitions and limitations: [README.md](README.md). Per-tool detail and raw runs are linked below.',
    '',
    '| Tool | Model | Runs (pass) | Total tokens: direct | codemode | Change | Wall time: direct | codemode | Change | Detail |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const svc of all) {
    const recs = loadRecords(svc.id);
    const models = [...new Set(recs.map((r) => r.model))];
    if (models.length === 0) out.push(`| ${svc.title} | - | no runs yet | - | - | - | - | - | - | [${svc.id}/RESULTS.md](${svc.id}/RESULTS.md) |`);
    for (const model of models) {
      const mr = recs.filter((r) => r.model === model);
      const s = summary(mr);
      const passes = mr.filter((r) => r.pass).length;
      out.push(
        `| ${svc.title} | \`${model}\` | ${mr.length} (${passes}) | ${fmt(s.d)} | ${fmt(s.c)} | **${pct(s.d, s.c)}** ` +
          `| ${s.dt.toFixed(1)}s | ${s.ct.toFixed(1)}s | **${pct(s.dt, s.ct)}** | [${svc.id}/RESULTS.md](${svc.id}/RESULTS.md) |`,
      );
    }
  }
  out.push(
    '',
    'Figures are means across all tasks and runs for that tool. Small differences, especially in wall time, are within noise at this sample size. Tools are not comparable with each other: tasks and tool counts differ.',
    '',
  );
  return out.join('\n');
}

export function writeReports(all: BenchService[]): string[] {
  const written: string[] = [];
  for (const svc of all) {
    writeFileSync(reportFile(svc.id), buildServiceReport(svc));
    written.push(reportFile(svc.id));
  }
  writeFileSync(overviewFile, buildOverview(all));
  written.push(overviewFile);
  return written;
}

