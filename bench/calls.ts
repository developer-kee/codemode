// Usage: npm run bench:calls -- --service <id> [--iters 10]
// Per-tool-call benchmark with no model: definition cost per tool, and one-call latency direct vs codemode.
// For the model-driven version (tokens per call) run the `<id>-calls` service with `npm run bench`.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildCallsReport, connectBoth, measureLatency, staticCosts } from './lib/calls.ts';
import { getSuite, suites } from './suites.ts';

const { values } = parseArgs({
  options: {
    service: { type: 'string', default: 'blender' },
    iters: { type: 'string', default: '10' },
  },
});

const suite = getSuite(values.service);
if (!suite) {
  console.error(`Unknown service "${values.service}". Available: ${suites.map((s) => s.id).join(', ')}`);
  process.exit(1);
}
const iterations = Number(values.iters);
if (!Number.isInteger(iterations) || iterations < 1) {
  console.error('--iters must be a positive integer');
  process.exit(1);
}

console.log(`WARNING: ${suite.base.warning}\n`);
await suite.preflight();
const { direct, codemode } = await connectBoth(suite.base);
try {
  const tools: Awaited<ReturnType<typeof direct.listTools>>['tools'] = [];
  let cursor: string | undefined;
  do {
    const page = await direct.listTools(cursor === undefined ? {} : { cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor !== undefined);

  const known = new Set(tools.map((t) => t.name));
  for (const c of suite.cases) if (!known.has(c.tool)) throw new Error(`Case ${c.id} names unknown tool ${c.tool}`);
  const listed = new Set([...suite.cases.map((c) => c.tool), ...suite.skipped.map((s) => s.tool)]);
  const unaccounted = tools.map((t) => t.name).filter((n) => !listed.has(n));
  if (unaccounted.length) console.warn(`Not in any case or skip list (add them): ${unaccounted.join(', ')}`);

  const costs = await staticCosts(tools, new Set(suite.cases.map((c) => c.tool)));
  const latency = await measureLatency(suite, direct, codemode, iterations, (l) => console.log(l));
  const md = buildCallsReport(suite, costs, latency, {
    date: new Date().toISOString().slice(0, 10),
    iterations,
    toolCount: tools.length,
  });
  const file = fileURLToPath(new URL(`./${suite.id}/CALLS.md`, import.meta.url));
  writeFileSync(file, md);
  console.log(`Wrote ${file}`);
} finally {
  await direct.close();
  await codemode.close();
}
process.exit(0);
