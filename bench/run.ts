// Usage: npm run bench -- --service <id> [--variant scenarios] [--runs 3] [--model claude-sonnet-5-5] [--runner auto] [--tasks a,b] [--paths direct,codemode] [--budget 2]
//        npm run bench -- --list
// Each service's warning (side effects, prerequisites) is printed first: read it.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { PathId } from './lib/agent.ts';
import { saveRecord, writeReports } from './lib/report.ts';
import { getRunner, runnerForModel, runners } from './lib/runners.ts';
import { getService, getVariant, services } from './registry.ts';

const { values } = parseArgs({
  options: {
    service: { type: 'string', default: 'blender' },
    variant: { type: 'string', default: '' },
    list: { type: 'boolean', default: false },
    runs: { type: 'string', default: '3' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    runner: { type: 'string', default: 'auto' },
    tasks: { type: 'string', default: '' },
    paths: { type: 'string', default: 'direct,codemode' },
    budget: { type: 'string', default: '2' },
    timeout: { type: 'string', default: '600' },
  },
});

if (values.list) {
  for (const s of services) {
    console.log(`${s.id}: ${s.title}`);
    for (const v of s.variants) {
      console.log(`  --variant ${v.id}${v.id === s.defaultVariant ? ' (default)' : ''}: ${v.tasks.map((t) => t.id).join(', ')}`);
    }
  }
  console.log(`\nRunners: ${runners.map((r) => `${r.id} (${r.description})`).join('; ')}`);
  process.exit(0);
}

const service = getService(values.service);
if (!service) {
  console.error(`Unknown service "${values.service}". Available: ${services.map((s) => s.id).join(', ')}`);
  process.exit(1);
}
const variant = getVariant(service, values.variant || service.defaultVariant);
if (!variant) {
  console.error(`Unknown variant "${values.variant}" for ${service.id}. Available: ${service.variants.map((v) => v.id).join(', ')}`);
  process.exit(1);
}
const runner = values.runner === 'auto' ? runnerForModel(values.model) : getRunner(values.runner);
if (!runner) {
  console.error(
    values.runner === 'auto'
      ? `No default runner for model "${values.model}". Pass --runner <id>: ${runners.map((r) => r.id).join(', ')}`
      : `Unknown runner "${values.runner}". Available: ${runners.map((r) => r.id).join(', ')}`,
  );
  process.exit(1);
}
const runs = Number(values.runs);
const wantTasks = values.tasks ? values.tasks.split(',') : variant.tasks.map((t) => t.id);
const wantPaths = values.paths.split(',') as PathId[];
const selected = variant.tasks.filter((t) => wantTasks.includes(t.id));
if (selected.length === 0 || !Number.isInteger(runs) || runs < 1) {
  console.error('Nothing to run: check --tasks and --runs');
  process.exit(1);
}

const workDir = fileURLToPath(new URL('./work/', import.meta.url));
console.log(`Runner: ${runner.id} (${runner.description}), model ${values.model}\n`);
console.log(`WARNING: ${service.warning}\n`);
if (variant.warning) console.log(`WARNING (${variant.id}): ${variant.warning}\n`);
await service.preflight();

const rev = (() => {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    // Results from an uncommitted working tree must not be attributed to the last commit alone.
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
    return dirty ? `${head}-dirty` : head;
  } catch {
    return undefined;
  }
})();
const batch = new Date().toISOString().replace(/[:.]/g, '-');
const totalRuns = selected.length * wantPaths.length * runs;
let n = 0;

for (let repeat = 1; repeat <= runs; repeat++) {
  for (const task of selected) {
    // Alternate which path goes first so drift (caching, load) doesn't favour one side.
    const order = repeat % 2 === 1 ? wantPaths : [...wantPaths].reverse();
    for (const path of order) {
      n++;
      await task.prepare();
      const run = await runner.run({
        service,
        variant,
        path,
        model: values.model,
        prompt: task.prompt,
        budgetUsd: Number(values.budget),
        timeoutMs: Number(values.timeout) * 1000,
        workDir,
      });
      const verdict = run.ok ? await task.verify(run.answer) : { pass: false, detail: run.error ?? 'run failed' };
      saveRecord(service.id, {
        batch,
        variant: variant.id,
        runner: runner.id,
        ...(rev ? { rev } : {}),
        task: task.id,
        model: values.model,
        repeat,
        pass: verdict.pass,
        verdict: verdict.detail,
        run,
      });
      const tokens = run.usage.input + run.usage.cacheWrite + run.usage.cacheRead + run.usage.output;
      console.log(
        `[${n}/${totalRuns}] ${service.id}/${variant.id}/${task.id} ${path} #${repeat}: ${verdict.pass ? 'PASS' : `FAIL (${verdict.detail})`} ` +
          `turns=${run.turns} tools=${run.toolCalls} tokens=${tokens} ` +
          `cost=${run.costUsd === undefined ? 'n/a' : `$${run.costUsd.toFixed(3)}`} time=${(run.durationMs / 1000).toFixed(1)}s`,
      );
    }
  }
}
console.log(`Reports: ${writeReports(services).join(', ')}`);
// Some services keep handles open (the Playwright fixture server), which would stop node from exiting.
process.exit(0);
