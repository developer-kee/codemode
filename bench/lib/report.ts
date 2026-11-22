import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AgentRun, PathId } from './agent.ts';
import { buildCallsSections, type CallsData } from './calls.ts';
import type { BenchService, BenchVariant } from './types.ts';

export interface RunRecord {
  batch: string;
  /** Which variant of the service was run. Records written before variants existed have none and count as `scenarios`. */
  variant: string;
  task: string;
  model: string;
  /** Runner id that drove the model. Absent on early records, which all used `claude`. */
  runner?: string;
  repeat: number;
  pass: boolean;
  verdict: string;
  /** Git revision of this repo when the run was made, so results can be tied to the wrapper design. */
  rev?: string;
  run: AgentRun;
}

/** The variant of records that carry none (everything recorded before variants existed). */
export const LEGACY_VARIANT = 'scenarios';

const benchRoot = fileURLToPath(new URL('../', import.meta.url));
export const resultsDir = (serviceId: string): string => `${benchRoot}${serviceId}/results/`;
export const callsFile = (serviceId: string): string => `${benchRoot}${serviceId}/calls-latest.json`;
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
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as Omit<RunRecord, 'variant'> & { variant?: string };
      records.push({ ...rec, variant: rec.variant ?? LEGACY_VARIANT });
    }
  }
  return records;
}

export function saveCalls(serviceId: string, data: CallsData): void {
  writeFileSync(callsFile(serviceId), `${JSON.stringify(data, null, 2)}\n`);
}

export function loadCalls(serviceId: string): CallsData | undefined {
  const file = callsFile(serviceId);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as CallsData) : undefined;
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
const total = (r: AgentRun): number => r.usage.input + r.usage.cacheWrite + r.usage.cacheRead + r.usage.output;
const pct = (from: number, to: number): string => (from === 0 ? (to === 0 ? '0%' : 'n/a') : `${(((to - from) / from) * 100).toFixed(0)}%`);

/** Spending for a group of runs, or `n/a` when any runner does not report cost. */
function costCell(recs: RunRecord[]): string {
  const costs = recs.map((r) => r.run.costUsd);
  if (costs.length === 0 || costs.some((c) => c === undefined)) return 'n/a';
  return `$${mean(costs as number[]).toFixed(3)}`;
}

/** Family display names for common model prefixes; anything else is capitalised from its own prefix. */
const FAMILY_NAMES: Record<string, string> = {
  claude: 'Claude',
  deepseek: 'DeepSeek',
  gpt: 'OpenAI',
  openai: 'OpenAI',
  o1: 'OpenAI',
  o3: 'OpenAI',
  gemini: 'Google',
  gemma: 'Google',
  llama: 'Meta',
  qwen: 'Qwen',
  mistral: 'Mistral',
  kimi: 'Moonshot',
  grok: 'xAI',
};
/** Families that sort first; any other family follows alphabetically. */
const FAMILY_ORDER = ['Claude', 'DeepSeek', 'Other'];

/** The family of a model id, from its leading alphanumeric token (`claude-sonnet-5-5` -> `Claude`). */
export function modelFamily(model: string): string {
  const key = model.trim().toLowerCase().match(/^[a-z0-9]+/)?.[0] ?? '';
  if (!key) return 'Other';
  return FAMILY_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Families present in `records`, in report order. */
export function familiesIn(records: RunRecord[]): string[] {
  const present = [...new Set(records.map((r) => modelFamily(r.model)))];
  const rank = (f: string): number => {
    const i = FAMILY_ORDER.indexOf(f);
    return i < 0 ? FAMILY_ORDER.length : i;
  };
  return present.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Runner that produced a record. Records without one predate `--runner` and all used `claude`. */
export const runnerOf = (r: RunRecord): string => r.runner ?? 'claude';
const runnersOf = (records: RunRecord[]): string[] => [...new Set(records.map(runnerOf))];

function row(label: string, recs: RunRecord[]): string {
  if (recs.length === 0) return `| ${label} | - | - | - | - | - | - | - | - | - | - |`;
  const f = (g: (r: RunRecord) => number): number => mean(recs.map(g));
  const passes = recs.filter((r) => r.pass).length;
  return (
    `| ${label} | ${passes}/${recs.length} | ${f((r) => r.run.turns).toFixed(1)} | ${f((r) => r.run.toolCalls).toFixed(1)} ` +
    `| ${fmt(f((r) => r.run.firstTurnContext))} | ${fmt(f((r) => r.run.usage.output))} ` +
    `| ${fmt(f((r) => r.run.usage.input + r.run.usage.cacheWrite))} | ${fmt(f((r) => r.run.usage.cacheRead))} ` +
    `| ${fmt(f((r) => total(r.run)))} | ${costCell(recs)} | ${(f((r) => r.run.durationMs) / 1000).toFixed(1)}s |`
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

/** Per-model tables for one variant: per-task summary, per-task detail, all tasks, failures. `h` is the heading level of the model section. */
function modelSection(variant: BenchVariant, model: string, mr: RunRecord[], h: string): string[] {
  const runners = runnersOf(mr);
  const via = runners.length === 1 ? ` via \`${runners[0]}\`` : '';
  const out: string[] = [`${h} Model: \`${model}\`${via}`, ''];
  const sub = `${h}#`;
  // One row per task: no single task can hide inside the averages below.
  const taskIds = variant.tasks.filter((t) => mr.some((r) => r.task === t.id));
  if (taskIds.length > 1) {
    out.push(
      `${sub} Per-task summary`,
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
          `| ${costCell(d)} | ${costCell(c)} |`,
      );
    }
    if (deltas.length > 1) {
      const best = deltas.reduce((a, b) => (b.tok < a.tok ? b : a));
      const worst = deltas.reduce((a, b) => (b.tok > a.tok ? b : a));
      out.push('', `Token change ranges from **${best.tok.toFixed(0)}%** (${best.id}) to **${worst.tok.toFixed(0)}%** (${worst.id}).`);
    }
    out.push('');
  }
  for (const task of variant.tasks) {
    const tr = mr.filter((r) => r.task === task.id);
    if (tr.length === 0) continue;
    out.push(`${sub} Task: ${task.id}`, '', header);
    for (const p of paths) out.push(row(p, tr.filter((r) => r.run.path === p)));
    out.push('');
  }
  out.push(`${sub} All tasks`, '', header);
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
  const failures = mr.filter((r) => !r.pass);
  if (failures.length) {
    out.push(`${sub} Failed runs`, '', '| Task | Path | Repeat | Reason |', '|---|---|---|---|');
    for (const r of failures) {
      out.push(`| ${r.task} | ${r.run.path} | ${r.repeat} | ${(r.run.error ?? r.verdict).replace(/\|/g, '/').slice(0, 120)} |`);
    }
    out.push('');
  }
  return out;
}

export function buildServiceReport(service: BenchService): string {
  const records = loadRecords(service.id);
  const out: string[] = [
    `# Benchmark: ${service.title}, direct MCP vs codemode`,
    '',
    ...service.notes.map((n) => `- ${n}`),
    '',
    'Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model\'s own claim.',
    `Variants: ${service.variants.map((v) => `\`${v.id}\``).join(', ')}. Method, metric definitions and limitations: [../README.md](../README.md).`,
    '',
    `> **Warning:** ${service.warning}`,
    '',
  ];
  if (records.length === 0) out.push('_No runs recorded yet._', '');
  // One place that says which families and runners exist, before the per-variant detail.
  if (records.length > 0) {
    out.push(
      '## Models',
      '',
      'Runs are grouped by model family, then by model id. Each family is produced by one runner, and every family uses the same tasks and prompts; ' +
        'token counts are comparable within a family, not necessarily across runners, because each harness sends its own system prompt and tool guidance.',
      '',
    );
    for (const family of familiesIn(records)) {
      const fr = records.filter((r) => modelFamily(r.model) === family);
      out.push(`### ${family}`, '', `Runner: ${runnersOf(fr).map((r) => `\`${r}\``).join(', ')}.`, '');
      for (const model of [...new Set(fr.map((r) => r.model))]) {
        const mr = fr.filter((r) => r.model === model);
        const variants = service.variants.filter((v) => mr.some((r) => r.variant === v.id)).map((v) => `\`${v.id}\``);
        out.push(`- \`${model}\`: ${mr.length} runs in ${variants.join(', ')}`);
      }
      out.push('');
    }
  }
  for (const variant of service.variants) {
    const vr = records.filter((r) => r.variant === variant.id);
    if (vr.length === 0) continue;
    out.push(
      `## Variant: \`${variant.id}\`, ${variant.title}`,
      '',
      ...variant.notes.map((n) => `- ${n}`),
      '',
      `Reproduce: \`npm run bench -- --service ${service.id} --variant ${variant.id} --runs 3\`.`,
      '',
    );
    if (variant.warning) out.push(`> **Warning:** ${variant.warning}`, '');
    for (const family of familiesIn(vr)) {
      const fm = vr.filter((r) => modelFamily(r.model) === family);
      out.push(`### ${family}`, '');
      for (const model of [...new Set(fm.map((r) => r.model))]) {
        out.push(...modelSection(variant, model, fm.filter((r) => r.model === model), '####'));
      }
    }
  }
  const calls = loadCalls(service.id);
  if (calls) out.push(...buildCallsSections(service.id, calls));
  out.push('## Task prompts', '', 'Identical text is sent on both paths. Prompts never name tools.', '');
  for (const variant of service.variants) {
    out.push(
      `### \`${variant.id}\``,
      '',
      ...variant.tasks.map((t) => `- **${t.id}**${t.seeded ? ' (pre-seeded)' : ''}: ${t.prompt}`),
      '',
    );
  }
  return out.join('\n');
}

export function buildOverview(all: BenchService[]): string {
  const out: string[] = [
    '# Benchmarks by service',
    '',
    'Each service is benchmarked separately: the same model, prompts and checks on two paths, the upstream MCP server used directly versus the same server behind codemode (`execute_code` with `get_api`). A service has several variants (the scenario tasks, one tool call per task, ...), listed as separate rows.',
    'Method, metric definitions and limitations: [README.md](README.md). Per-service detail and raw runs are linked below.',
    '',
  ];
  const records = all.flatMap((svc) => loadRecords(svc.id));
  if (records.length === 0) out.push('_No runs recorded yet._', '');
  for (const family of familiesIn(records)) {
    out.push(`## ${family}`, '');
    out.push(
      '| Service | Variant | Model | Runner | Runs (pass) | Total tokens: direct | codemode | Change | Wall time: direct | codemode | Change | Detail |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|',
    );
    for (const svc of all) {
      const recs = loadRecords(svc.id);
      const link = `[${svc.id}/RESULTS.md](${svc.id}/RESULTS.md)`;
      for (const variant of svc.variants) {
        const vr = recs.filter((r) => r.variant === variant.id && modelFamily(r.model) === family);
        for (const model of [...new Set(vr.map((r) => r.model))]) {
          const mr = vr.filter((r) => r.model === model);
          const s = summary(mr);
          const passes = mr.filter((r) => r.pass).length;
          out.push(
            `| ${svc.title} | \`${variant.id}\` | \`${model}\` | ${runnersOf(mr).map((r) => `\`${r}\``).join(', ')} | ${mr.length} (${passes}) ` +
              `| ${fmt(s.d)} | ${fmt(s.c)} | **${pct(s.d, s.c)}** | ${s.dt.toFixed(1)}s | ${s.ct.toFixed(1)}s | **${pct(s.dt, s.ct)}** | ${link} |`,
          );
        }
      }
    }
    out.push('');
  }
  out.push(
    'Figures are means across all tasks and runs of that variant. Small differences, especially in wall time, are within noise at this sample size. Services and variants are not comparable with each other: tasks and tool counts differ.',
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
