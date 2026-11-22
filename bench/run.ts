// Usage: npm run bench -- [--runs 3] [--model claude-sonnet-5-5] [--tasks table,grid] [--paths direct,codemode] [--budget 2]
// Needs: Blender open with the BlenderMCP addon connected (localhost:9876). The scene is WIPED before every run.
import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resetScene, seedScene, snapshotScene } from './blender.ts';
import { runClaude, type PathId } from './claude.ts';
import { saveRecord, writeReport } from './report.ts';
import { tasks } from './tasks.ts';

const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: '3' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    tasks: { type: 'string', default: '' },
    paths: { type: 'string', default: 'direct,codemode' },
    budget: { type: 'string', default: '2' },
    timeout: { type: 'string', default: '600' },
  },
});

const runs = Number(values.runs);
const wantTasks = values.tasks ? values.tasks.split(',') : tasks.map((t) => t.id);
const wantPaths = values.paths.split(',') as PathId[];
const selected = tasks.filter((t) => wantTasks.includes(t.id));
if (selected.length === 0 || !Number.isInteger(runs) || runs < 1) {
  console.error('Nothing to run: check --tasks and --runs');
  process.exit(1);
}

mkdirSync(fileURLToPath(new URL('./results/', import.meta.url)), { recursive: true });
const batch = new Date().toISOString().replace(/[:.]/g, '-');
let n = 0;
const totalRuns = selected.length * wantPaths.length * runs;

for (let repeat = 1; repeat <= runs; repeat++) {
  for (const task of selected) {
    // Alternate which path goes first so drift (caching, load) doesn't favour one side.
    const order = repeat % 2 === 1 ? wantPaths : [...wantPaths].reverse();
    for (const path of order) {
      n++;
      await resetScene();
      if (task.seed) await seedScene(task.seed);
      const run = await runClaude({
        path,
        model: values.model,
        prompt: task.prompt,
        budgetUsd: Number(values.budget),
        timeoutMs: Number(values.timeout) * 1000,
      });
      const scene = await snapshotScene();
      const verdict = run.ok ? task.verify(scene, run.answer) : { pass: false, detail: run.error ?? 'run failed' };
      saveRecord({ batch, task: task.id, model: values.model, repeat, pass: verdict.pass, verdict: verdict.detail, run });
      const tokens = run.usage.input + run.usage.cacheWrite + run.usage.cacheRead + run.usage.output;
      console.log(
        `[${n}/${totalRuns}] ${task.id} ${path} #${repeat}: ${verdict.pass ? 'PASS' : `FAIL (${verdict.detail})`} ` +
          `turns=${run.turns} tools=${run.toolCalls} tokens=${tokens} cost=$${run.costUsd.toFixed(3)}`,
      );
    }
  }
}
console.log(`Report: ${writeReport()}`);
