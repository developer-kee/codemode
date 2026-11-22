// Usage: npm run bench:calls -- --service <id> [--iters 10]
// Per-tool-call benchmark with no model: definition cost per tool, and one-call latency direct vs codemode.
// Writes bench/<id>/calls-latest.json and rebuilds the reports. For the model-driven version (tokens per call)
// run `npm run bench -- --service <id> --variant calls`.
import { parseArgs } from 'node:util';
import { connectBoth, makeCallsData, measureLatency, staticCosts } from './lib/calls.ts';
import { callsFile, saveCalls, writeReports } from './lib/report.ts';
import { getService, getVariant, services } from './registry.ts';

const { values } = parseArgs({
  options: {
    service: { type: 'string', default: 'blender' },
    iters: { type: 'string', default: '10' },
  },
});

const service = getService(values.service);
if (!service) {
  console.error(`Unknown service "${values.service}". Available: ${services.map((s) => s.id).join(', ')}`);
  process.exit(1);
}
const variant = getVariant(service, service.defaultVariant);
if (!variant) throw new Error(`${service.id}: default variant ${service.defaultVariant} is not defined`);
const iterations = Number(values.iters);
if (!Number.isInteger(iterations) || iterations < 1) {
  console.error('--iters must be a positive integer');
  process.exit(1);
}

console.log(`WARNING: ${service.warning}\n`);
if (variant.warning) console.log(`WARNING (${variant.id}): ${variant.warning}\n`);
await service.preflight();
const def = service.calls;
const { direct, codemode } = await connectBoth(service, variant);
try {
  const tools: Awaited<ReturnType<typeof direct.listTools>>['tools'] = [];
  let cursor: string | undefined;
  do {
    const page = await direct.listTools(cursor === undefined ? {} : { cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor !== undefined);

  const known = new Set(tools.map((t) => t.name));
  for (const c of def.cases) if (!known.has(c.tool)) throw new Error(`Case ${c.id} names unknown tool ${c.tool}`);
  const listed = new Set([...def.cases.map((c) => c.tool), ...def.skipped.map((s) => s.tool)]);
  const unaccounted = tools.map((t) => t.name).filter((n) => !listed.has(n));
  if (unaccounted.length) console.warn(`Not in any case or skip list (add them): ${unaccounted.join(', ')}`);

  const costs = await staticCosts(tools, new Set(def.cases.map((c) => c.tool)));
  const latency = await measureLatency(def, direct, codemode, iterations, (l) => console.log(l));
  saveCalls(
    service.id,
    makeCallsData(def, costs, latency, { date: new Date().toISOString().slice(0, 10), iterations, toolCount: tools.length }),
  );
  console.log(`Wrote ${callsFile(service.id)}`);
  console.log(`Reports: ${writeReports(services).join(', ')}`);
} finally {
  await direct.close();
  await codemode.close();
}
process.exit(0);
