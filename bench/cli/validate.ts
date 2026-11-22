// Usage: npm run bench:validate
// Offline validation of the benchmark suite: service definitions, recorded runs, per-call data and the
// generated reports. No MCP server is started and no model is called, so this is free and safe to run often.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CLAUDE_CODE_DESCRIPTION_CAP } from '../lib/calls/static.ts';
import {
  buildOverview,
  buildServiceReport,
  familiesIn,
  loadCalls,
  loadRecords,
  modelFamily,
  overviewFile,
  reportFile,
  runnerOf,
  type RunRecord,
} from '../lib/report/index.ts';
import { servicePath } from '../../src/services.ts';
import { runners } from '../lib/runners/index.ts';
import { services } from '../registry.ts';
import type { BenchService, BenchVariant } from '../lib/types/index.ts';

type Level = 'error' | 'warn';
interface Issue {
  level: Level;
  scope: string;
  message: string;
}

const issues: Issue[] = [];
const add = (level: Level, scope: string, message: string): void => {
  issues.push({ level, scope, message });
};
const error = (scope: string, message: string): void => add('error', scope, message);
const warn = (scope: string, message: string): void => add('warn', scope, message);

const benchRoot = fileURLToPath(new URL('../', import.meta.url));
const readText = (path: string): string | undefined => (existsSync(path) ? readFileSync(path, 'utf8') : undefined);
/** Reports are written with LF; a checkout can turn them into CRLF. Compare on LF only. */
const lf = (s: string): string => s.replace(/\r\n/g, '\n');

const isFiniteNonNegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isCount = (n: unknown): n is number => isFiniteNonNegative(n) && Number.isInteger(n);

function checkVariant(service: BenchService, variant: BenchVariant): void {
  const scope = `${service.id}/${variant.id}`;
  if (!variant.title.trim()) error(scope, 'variant has no title');
  if (!variant.systemPrompt.trim()) error(scope, 'variant has no system prompt');
  if (!variant.direct.command.trim()) error(scope, 'variant has no direct upstream command');
  if (!Array.isArray(variant.direct.args)) error(scope, 'variant direct.args must be an array');
  // A `calls` variant is empty when no case has a model prompt: the suite is then latency and definition cost only.
  const latencyOnly = variant.id === 'calls' && service.calls.cases.every((c) => c.prompt === undefined);
  if (variant.tasks.length === 0 && !latencyOnly) error(scope, 'variant has no tasks');
  const taskIds = new Set<string>();
  for (const t of variant.tasks) {
    if (!t.id.trim()) error(scope, 'a task has an empty id');
    if (taskIds.has(t.id)) error(scope, `duplicate task id "${t.id}"`);
    taskIds.add(t.id);
    if (!t.prompt.trim()) error(scope, `task "${t.id}" has an empty prompt`);
    if (typeof t.prepare !== 'function') error(scope, `task "${t.id}" has no prepare()`);
    if (typeof t.verify !== 'function') error(scope, `task "${t.id}" has no verify()`);
  }
}

function checkServiceDefinition(service: BenchService): void {
  const scope = service.id;
  if (!/^[a-z0-9_-]+$/.test(service.id)) error(scope, 'service id must be lower-case letters, digits, "-" or "_"');
  if (!existsSync(`${benchRoot}suites/${service.id}/`)) error(scope, 'missing suite folder under bench/suites/');
  const wrapper = service.wrapper ?? service.id;
  if (!existsSync(`${servicePath(`${benchRoot}../services/`, wrapper)}.ts`)) warn(scope, `no service ${wrapper} in services/ (the wrapper CLI has no such service)`);
  const variantIds = new Set<string>();
  for (const v of service.variants) {
    if (variantIds.has(v.id)) error(scope, `duplicate variant id "${v.id}"`);
    variantIds.add(v.id);
    checkVariant(service, v);
  }
  if (!variantIds.has(service.defaultVariant)) error(scope, `defaultVariant "${service.defaultVariant}" is not one of the variants`);
  if (!service.warning.trim()) error(scope, 'service has no warning');
  if (service.notes.length === 0) warn(scope, 'service has no report notes');
  if (typeof service.preflight !== 'function') error(scope, 'service has no preflight()');

  const caseIds = new Set<string>();
  for (const c of service.calls.cases) {
    if (!c.id.trim()) error(`${scope}/calls`, 'a case has an empty id');
    if (caseIds.has(c.id)) error(`${scope}/calls`, `duplicate case id "${c.id}"`);
    caseIds.add(c.id);
    if (!c.tool.trim()) error(`${scope}/calls`, `case "${c.id}" has no tool`);
    if (typeof c.args !== 'object' || c.args === null || Array.isArray(c.args)) error(`${scope}/calls`, `case "${c.id}" args must be an object`);
  }
  for (const s of service.calls.skipped) {
    if (!s.tool.trim()) error(`${scope}/calls`, 'a skipped tool has an empty name');
    if (!s.reason.trim()) error(`${scope}/calls`, `skipped tool "${s.tool}" has no reason`);
    if (caseIds.has(s.tool)) error(`${scope}/calls`, `tool "${s.tool}" is both a case and skipped`);
  }
  if (service.calls.cases.length === 0) error(`${scope}/calls`, 'no per-call cases');
}

function checkRun(service: BenchService, rec: RunRecord): void {
  const scope = `${service.id}/${rec.variant}/${rec.task}/${rec.run.path}/#${rec.repeat}`;
  const variant = service.variants.find((v) => v.id === rec.variant);
  if (!variant) {
    error(scope, `unknown variant "${rec.variant}" (results were recorded by a different registry)`);
    return;
  }
  if (!variant.tasks.some((t) => t.id === rec.task)) error(scope, `unknown task "${rec.task}" for variant "${variant.id}"`);
  if (!rec.model.trim()) error(scope, 'empty model id');
  if (!rec.batch.trim()) error(scope, 'empty batch id');
  if (rec.runner !== undefined && !runners.some((r) => r.id === rec.runner)) {
    error(scope, `unknown runner "${rec.runner}" (known: ${runners.map((r) => r.id).join(', ')})`);
  }
  const path: string = rec.run.path;
  if (path !== 'direct' && path !== 'codemode') error(scope, `unknown path "${path}"`);
  if (!isCount(rec.repeat) || rec.repeat < 1) error(scope, 'repeat must be an integer >= 1');
  for (const [k, v] of Object.entries(rec.run.usage)) {
    if (!isCount(v)) error(scope, `usage.${k} must be a non-negative integer, got ${String(v)}`);
  }
  for (const [k, v] of [
    ['turns', rec.run.turns],
    ['toolCalls', rec.run.toolCalls],
    ['firstTurnContext', rec.run.firstTurnContext],
  ] as const) {
    if (!isCount(v)) error(scope, `run.${k} must be a non-negative integer, got ${String(v)}`);
  }
  if (rec.run.costUsd !== undefined && !isFiniteNonNegative(rec.run.costUsd)) {
    error(scope, `costUsd must be >= 0 when present, got ${String(rec.run.costUsd)}`);
  }
  if (!isFiniteNonNegative(rec.run.durationMs)) error(scope, `durationMs must be >= 0, got ${String(rec.run.durationMs)}`);
  if (rec.run.apiMs !== undefined && !isFiniteNonNegative(rec.run.apiMs)) error(scope, `apiMs must be >= 0 when present`);
  if (typeof rec.pass !== 'boolean') error(scope, 'pass must be a boolean');
  if (typeof rec.verdict !== 'string' || !rec.verdict.trim()) error(scope, 'empty verdict');
  if (rec.pass && !rec.run.ok) error(scope, 'marked passed although the run itself failed');
  if (rec.run.ok && rec.run.turns === 0) warn(scope, 'run reported success with zero turns');
  if (rec.pass && rec.run.error !== undefined) warn(scope, 'passed run carries an error message');
  // The benchmark exposes only the MCP server, so any other tool name means a built-in tool leaked into the run.
  for (const name of rec.run.toolNames) {
    if (!name.startsWith('mcp__')) warn(scope, `tool call "${name}" is not an MCP tool; built-in tools may not be off`);
  }
}

function checkServiceData(service: BenchService): void {
  const records = loadRecords(service.id);
  if (records.length === 0) {
    warn(service.id, 'no recorded runs');
    return;
  }
  for (const rec of records) checkRun(service, rec);

  const seen = new Set<string>();
  for (const rec of records) {
    const key = `${rec.batch}|${rec.variant}|${rec.task}|${rec.run.path}|${rec.repeat}`;
    if (seen.has(key)) warn(`${service.id}`, `duplicate record: ${key}`);
    seen.add(key);
  }

  // Each variants' tasks should each have been run on both paths once.
  for (const variant of service.variants) {
    const vr = records.filter((r) => r.variant === variant.id);
    if (vr.length === 0) continue;
    for (const path of ['direct', 'codemode'] as const) {
      if (!vr.some((r) => r.run.path === path)) error(`${service.id}/${variant.id}`, `no "${path}" runs`);
    }
    for (const t of variant.tasks) {
      if (!vr.some((r) => r.task === t.id)) warn(`${service.id}/${variant.id}`, `task "${t.id}" was never run`);
    }
  }

  // A model measured through two runners is not directly comparable with itself; make that loud.
  for (const model of [...new Set(records.map((r) => r.model))]) {
    const used = [...new Set(records.filter((r) => r.model === model).map(runnerOf))];
    if (used.length > 1) warn(`${service.id}/${model}`, `recorded with more than one runner: ${used.join(', ')}`);
  }

  for (const family of familiesIn(records)) {
    const fr = records.filter((r) => modelFamily(r.model) === family);
    const used = [...new Set(fr.map(runnerOf))];
    console.log(`  ${service.id.padEnd(10)} ${family.padEnd(8)} ${String(fr.length).padStart(3)} runs via ${used.join(', ')}`);
  }
}

function checkCalls(service: BenchService): void {
  const calls = loadCalls(service.id);
  if (!calls) {
    console.log(`  ${service.id.padEnd(10)} per-call  no calls-latest.json (run npm run bench:calls -- --service ${service.id})`);
    return;
  }
  const scope = `${service.id}/calls-latest.json`;
  if (!isCount(calls.toolCount) || calls.toolCount < 1) error(scope, 'toolCount must be a positive integer');
  if (!isCount(calls.iterations) || calls.iterations < 1) error(scope, 'iterations must be a positive integer');
  if (!calls.date.trim()) error(scope, 'empty date');
  if (calls.costs.rows.length !== calls.toolCount) {
    error(scope, `${calls.costs.rows.length} definition rows for ${calls.toolCount} tools`);
  }
  if (calls.costs.descriptionChars > CLAUDE_CODE_DESCRIPTION_CAP) {
    error(scope, `execute_code description is ${calls.costs.descriptionChars} chars, over the ${CLAUDE_CODE_DESCRIPTION_CAP} cap`);
  }
  if (calls.costs.descriptionChars <= 0) error(scope, 'descriptionChars must be positive');
  if (![1, 2, 3, 4].includes(calls.costs.indexLevel)) error(scope, `indexLevel ${String(calls.costs.indexLevel)} is not 1-4`);
  const tools = new Set(calls.costs.rows.map((r) => r.tool));
  for (const c of calls.cases) {
    if (!tools.has(c.tool)) error(scope, `case "${c.id}" names tool "${c.tool}", which is not in the definition table`);
  }
  const caseTools = new Set(calls.cases.map((c) => c.tool));
  if (calls.coveredTools !== caseTools.size) {
    error(scope, `coveredTools is ${calls.coveredTools} but cases name ${caseTools.size} distinct tools`);
  }
  for (const s of calls.skipped) {
    if (!tools.has(s.tool)) warn(scope, `skipped tool "${s.tool}" is not in the definition table`);
    if (caseTools.has(s.tool)) error(scope, `skipped tool "${s.tool}" also has a case`);
  }
  if (calls.latency.rows.length !== calls.cases.length) {
    warn(scope, `${calls.latency.rows.length} latency rows for ${calls.cases.length} cases`);
  }
  for (const r of calls.latency.rows) {
    const s = [r.direct, r.codemode];
    for (const st of s) {
      if (!(st.min <= st.median && st.median <= st.p95 && st.p95 <= st.max)) {
        error(scope, `${r.id}: stats are not ordered min <= median <= p95 <= max`);
      }
    }
    for (const st of s) {
      for (const [k, v] of Object.entries(st)) if (!isFiniteNonNegative(v)) error(scope, `${r.id}: ${k} is not a non-negative number`);
    }
    if (r.errors.direct > calls.iterations || r.errors.codemode > calls.iterations) {
      error(scope, `${r.id}: more errors than iterations`);
    }
  }
  if (!isFiniteNonNegative(calls.latency.sandboxOnly.median)) error(scope, 'sandboxOnly.median must be >= 0');
  console.log(
    `  ${service.id.padEnd(10)} per-call  ${calls.toolCount} tools, description ${calls.costs.descriptionChars}/${CLAUDE_CODE_DESCRIPTION_CAP} chars, ` +
      `${calls.cases.length} cases, ${calls.iterations} iterations`,
  );
}

function checkReports(service: BenchService): void {
  const expected = lf(buildServiceReport(service));
  const actual = readText(reportFile(service.id));
  if (actual === undefined) {
    error(`suites/${service.id}/RESULTS.md`, 'missing generated report');
  } else if (lf(actual) !== expected) {
    error(`suites/${service.id}/RESULTS.md`, 'is out of date; run npm run bench:report');
  }
}

function main(): void {
  console.log(`Validating ${services.length} benchmarked services under ${benchRoot}\n`);

  const ids = new Set<string>();
  for (const service of services) {
    if (ids.has(service.id)) error(service.id, 'duplicate service id in registry');
    ids.add(service.id);
    console.log(`${service.id}: ${service.title}`);
    checkServiceDefinition(service);
    checkServiceData(service);
    checkCalls(service);
    checkReports(service);
  }

  const expected = lf(buildOverview(services));
  const actual = readText(overviewFile);
  if (actual === undefined) error('RESULTS.md', 'missing generated overview');
  else if (lf(actual) !== expected) error('RESULTS.md', 'overview is out of date; run npm run bench:report');

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warn');
  console.log('');
  if (issues.length === 0) {
    console.log('OK: definitions, recorded runs, per-call data and generated reports are consistent.');
  } else {
    for (const i of issues) console.log(`${i.level === 'error' ? 'ERROR' : 'warn '} ${i.scope}: ${i.message}`);
    console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).`);
  }
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
