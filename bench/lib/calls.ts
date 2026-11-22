// Generic per-tool-call benchmarking. Works for any MCP: the only per-tool input is a list of cases (data).
//
//   static   what each tool's definition costs the model on every turn (direct) vs its slice of the typed API (codemode)
//   latency  one call at a time, direct vs through codemode's sandbox, many iterations, no model involved
//   model    one prompt per tool call, run through the normal harness as the `calls` variant (see callsVariant); optional, costs tokens
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { generateApi, toIdentifier } from '../../src/generate.ts';
import { compactIndex, describeExecuteCode, GET_API_DESCRIPTION, headerBudget } from '../../src/describe.ts';
import { connectUpstream } from '../../src/server.ts';
import type { BenchService, BenchVariant, CallCase, CallDef, SkippedTool, Task, Verdict } from './types.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));

// ------------------------------------------------------------------------------------------------
// Model-driven: turn cases into tasks for the normal harness (run.ts), one task per tool call.
// ------------------------------------------------------------------------------------------------

/** The `calls` variant of a service: one task per case that has a prompt, on the same upstream setup as `base`. */
export function callsVariant(base: BenchVariant, def: CallDef): BenchVariant {
  const tasks: Task[] = def.cases
    .filter((c) => c.prompt !== undefined && (c.expect !== undefined || c.check !== undefined))
    .map((c) => ({
      id: c.id,
      prompt: c.prompt ?? '',
      seeded: true,
      prepare: () => def.reset(),
      async verify(answer: string): Promise<Verdict> {
        if (c.check) return c.check(answer);
        return c.expect?.test(answer)
          ? { pass: true, detail: 'ok' }
          : { pass: false, detail: `answer did not match ${String(c.expect)}: ${answer.slice(0, 80)}` };
      },
    }));
  return {
    ...base,
    id: 'calls',
    title: 'one tool call per task',
    notes: [
      `Each task asks for exactly one upstream tool call (${tasks.length} of ${def.cases.length} cases have a model prompt), so no single tool can dominate the totals and each tool is visible on its own row.`,
      'Same cases as the deterministic latency benchmark (`npm run bench:calls`), so a tool can be followed from definition cost, to raw latency, to model tokens.',
      ...base.notes,
    ],
    tasks,
  };
}

// ------------------------------------------------------------------------------------------------
// Static: definition cost per tool.
// ------------------------------------------------------------------------------------------------

/** Rough token estimate. Real tokenisation varies with content; use for relative comparison. */
export const estimateTokens = (chars: number): number => Math.round(chars / 4);

export interface StaticRow {
  tool: string;
  covered: boolean;
  directChars: number;
  /** This tool's line in the execute_code description (always sent). */
  codemodeChars: number;
  /** The full declaration get_api returns for it (sent only if the model asks). */
  onDemandChars: number;
}

export interface StaticCosts {
  rows: StaticRow[];
  directTotalChars: number;
  /** execute_code description plus both tool definitions: what is sent every turn. */
  codemodeTotalChars: number;
  /** execute_code description length; Claude Code cuts descriptions at about 2,048 characters. */
  descriptionChars: number;
  /** How detailed the index in the description is (1 richest, 4 names only, truncated). */
  indexLevel: number;
}

export const CLAUDE_CODE_DESCRIPTION_CAP = 2048;

export async function staticCosts(tools: readonly Tool[], covered: ReadonlySet<string>): Promise<StaticCosts> {
  const { perTool } = await generateApi(tools);
  const index = compactIndex(tools, headerBudget());
  const description = describeExecuteCode(index);
  const rows = tools.map((t): StaticRow => {
    const id = toIdentifier(t.name);
    return {
      tool: t.name,
      covered: covered.has(t.name),
      // What an MCP client sends the model per tool: name, description, input schema.
      directChars: JSON.stringify({ name: t.name, description: t.description ?? '', input_schema: t.inputSchema }).length,
      codemodeChars: (index.lines[id] ?? '').length,
      onDemandChars: (perTool[id] ?? '').length,
    };
  });
  const defs =
    JSON.stringify({ name: 'execute_code', description, input_schema: { type: 'object', properties: { code: { type: 'string' } } } }).length +
    JSON.stringify({ name: 'get_api', description: GET_API_DESCRIPTION, input_schema: { type: 'object', properties: { names: { type: 'array' } } } }).length;
  return {
    rows,
    directTotalChars: rows.reduce((n, r) => n + r.directChars, 0),
    codemodeTotalChars: defs,
    descriptionChars: description.length,
    indexLevel: index.level,
  };
}

// ------------------------------------------------------------------------------------------------
// Latency: one call at a time, direct vs through codemode, with no model.
// ------------------------------------------------------------------------------------------------

export interface Stats {
  median: number;
  p95: number;
  min: number;
  max: number;
}

export interface LatencyRow {
  id: string;
  tool: string;
  iterations: number;
  direct: Stats;
  codemode: Stats;
  directChars: number;
  codemodeChars: number;
  errors: { direct: number; codemode: number };
}

export interface LatencyResult {
  rows: LatencyRow[];
  /** `return 1` through execute_code: the sandbox and bridge with no upstream call at all. */
  sandboxOnly: Stats;
}

function stats(xs: number[]): Stats {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  return { median: at(0.5), p95: at(0.95), min: s[0] ?? 0, max: s[s.length - 1] ?? 0 };
}

function resultChars(res: CallToolResult): number {
  let n = 0;
  for (const c of res.content ?? []) n += c.type === 'text' ? c.text.length : 'data' in c ? String(c.data).length : 0;
  return n;
}

async function timed(fn: () => Promise<CallToolResult>): Promise<{ ms: number; chars: number; ok: boolean }> {
  const t0 = performance.now();
  try {
    const res = await fn();
    return { ms: performance.now() - t0, chars: resultChars(res), ok: res.isError !== true };
  } catch {
    return { ms: performance.now() - t0, chars: 0, ok: false };
  }
}

export async function measureLatency(
  def: CallDef,
  direct: Client,
  codemode: Client,
  iterations: number,
  log: (line: string) => void = () => undefined,
): Promise<LatencyResult> {
  const callDirect = (c: CallCase) => () => direct.callTool({ name: c.tool, arguments: c.args }) as Promise<CallToolResult>;
  const callCodemode = (c: CallCase) => () =>
    codemode.callTool({
      name: 'execute_code',
      arguments: { code: `return await codemode.${toIdentifier(c.tool)}(${JSON.stringify(c.args)});` },
    }) as Promise<CallToolResult>;

  const rows: LatencyRow[] = [];
  for (const c of def.cases) {
    await def.reset();
    for (const b of c.before ?? []) {
      await direct.callTool({ name: b.tool, arguments: b.args });
      await codemode.callTool({
        name: 'execute_code',
        arguments: { code: `return await codemode.${toIdentifier(b.tool)}(${JSON.stringify(b.args)});` },
      });
    }
    await timed(callDirect(c)); // warm-up, not recorded
    await timed(callCodemode(c));
    const d: number[] = [];
    const m: number[] = [];
    let dChars = 0;
    let mChars = 0;
    const errors = { direct: 0, codemode: 0 };
    for (let i = 0; i < iterations; i++) {
      const a = await timed(callDirect(c));
      const b = await timed(callCodemode(c));
      d.push(a.ms);
      m.push(b.ms);
      dChars = a.chars;
      mChars = b.chars;
      if (!a.ok) errors.direct++;
      if (!b.ok) errors.codemode++;
    }
    rows.push({
      id: c.id,
      tool: c.tool,
      iterations,
      direct: stats(d),
      codemode: stats(m),
      directChars: dChars,
      codemodeChars: mChars,
      errors,
    });
    log(`${c.id}: direct ${stats(d).median.toFixed(0)}ms, codemode ${stats(m).median.toFixed(0)}ms`);
  }

  const noop: number[] = [];
  const nothing = (): Promise<CallToolResult> =>
    codemode.callTool({ name: 'execute_code', arguments: { code: 'return 1;' } }) as Promise<CallToolResult>;
  await timed(nothing);
  for (let i = 0; i < iterations * 2; i++) noop.push((await timed(nothing)).ms);
  return { rows, sandboxOnly: stats(noop) };
}

// ------------------------------------------------------------------------------------------------
// Connections
// ------------------------------------------------------------------------------------------------

export async function connectBoth(service: BenchService, variant: BenchVariant): Promise<{ direct: Client; codemode: Client }> {
  const direct = await connectUpstream({
    command: variant.direct.command,
    args: variant.direct.args,
    ...(variant.direct.env ? { env: variant.direct.env } : {}),
  });
  const codemode = await connectUpstream({
    command: process.execPath,
    args: [`${root}src/cli.ts`, service.id],
    ...(variant.codemodeEnv ? { env: variant.codemodeEnv } : {}),
  });
  return { direct, codemode };
}

// ------------------------------------------------------------------------------------------------
// Result file (`<service>/calls-latest.json`) and its report sections
// ------------------------------------------------------------------------------------------------

/** What `bench:calls` writes: everything the report needs, so RESULTS.md can be rebuilt without rerunning. */
export interface CallsData {
  date: string;
  iterations: number;
  /** Upstream tools offered. */
  toolCount: number;
  costs: StaticCosts;
  latency: LatencyResult;
  /** Tools with at least one case. */
  coveredTools: number;
  skipped: SkippedTool[];
  cases: { id: string; tool: string; args: Record<string, unknown>; hasPrompt: boolean }[];
}

export function makeCallsData(
  def: CallDef,
  costs: StaticCosts,
  latency: LatencyResult,
  meta: { date: string; iterations: number; toolCount: number },
): CallsData {
  return {
    ...meta,
    costs,
    latency,
    coveredTools: new Set(def.cases.map((c) => c.tool)).size,
    skipped: def.skipped,
    cases: def.cases.map((c) => ({ id: c.id, tool: c.tool, args: c.args, hasPrompt: c.prompt !== undefined })),
  };
}

const ms = (n: number): string => (n < 10 ? n.toFixed(1) : String(Math.round(n)));
const signed = (n: number): string => (n < 0 ? '-' : '+') + ms(Math.abs(n));
const tok = (chars: number): string => estimateTokens(chars).toLocaleString('en-US');

/** Report sections for the deterministic per-call benchmark, ready to append to a service's RESULTS.md. */
export function buildCallsSections(serviceId: string, data: CallsData): string[] {
  const { costs, latency } = data;
  const out: string[] = [
    '## Per-tool-call benchmark (no model)',
    '',
    'One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool\'s **definition** costs the model on every turn, how long **one call** takes directly versus through codemode\'s sandbox, and (optionally) the tokens a model spends making that one call (the `calls` variant in `npm run bench`). Method and caveats: [../README.md](../README.md).',
    '',
    `Generated ${data.date}. ${data.toolCount} upstream tools, ${data.cases.length} cases over ${data.coveredTools} tools, ${data.iterations} timed iterations per case after one warm-up.`,
    `Reproduce: \`npm run bench:calls -- --service ${serviceId} --iters ${data.iterations}\`.`,
    '',
    '### Definition cost per tool',
    '',
    'What the model is sent for each tool on **every turn**. `Direct` is the tool\'s name, description and input schema as JSON. `Codemode, always sent` is that tool\'s line in the `execute_code` description (name, parameters, one-line summary). `On demand` is its full TypeScript declaration, which the model only receives if it calls `get_api`. Tokens are estimated as characters / 4: good for comparing rows with each other, not an exact count.',
    '',
    '| Tool | Direct (≈ tokens) | Codemode, always sent (≈) | Codemode, on demand via get_api (≈) | In per-call cases |',
    '|---|---|---|---|---|',
  ];
  for (const r of [...costs.rows].sort((a, b) => b.directChars - a.directChars)) {
    out.push(`| ${r.tool} | ${tok(r.directChars)} | ${tok(r.codemodeChars)} | ${tok(r.onDemandChars)} | ${r.covered ? 'yes' : 'no'} |`);
  }
  const fits = costs.descriptionChars <= CLAUDE_CODE_DESCRIPTION_CAP;
  const biggest = Math.max(...costs.rows.map((r) => r.directChars));
  out.push(
    `| **Total sent every turn** | **${tok(costs.directTotalChars)}** | **${tok(costs.codemodeTotalChars)}** (execute_code and get_api, with their fixed text) | | |`,
    '',
    `The biggest single definition is ${tok(biggest)} tokens, ${((biggest / costs.directTotalChars) * 100).toFixed(0)}% of the direct total.`,
    '',
    `**Truncation guard.** Claude Code cuts an MCP tool description at about ${CLAUDE_CODE_DESCRIPTION_CAP.toLocaleString('en-US')} characters; anything past that never reaches the model. The \`execute_code\` description here is **${costs.descriptionChars.toLocaleString('en-US')} characters** (${fits ? 'fits' : '**OVER THE CAP**'}), listing every function at detail level ${costs.indexLevel} (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../README.md).`,
    '',
    '### Latency per call (no model)',
    '',
    'Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.',
    '',
    '| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const r of latency.rows) {
    out.push(
      `| ${r.id} | ${ms(r.direct.median)} | ${ms(r.direct.p95)} | ${ms(r.codemode.median)} | ${ms(r.codemode.p95)} ` +
        `| ${signed(r.codemode.median - r.direct.median)} ms | ${r.directChars.toLocaleString('en-US')} | ${r.codemodeChars.toLocaleString('en-US')} | ${r.errors.direct}/${r.errors.codemode} |`,
    );
  }
  out.push(
    '',
    `Sandbox-only cost (\`return 1\` through \`execute_code\`, no upstream call): median ${ms(latency.sandboxOnly.median)} ms, p95 ${ms(latency.sandboxOnly.p95)} ms. This is the floor of codemode's per-call overhead.`,
    '',
    '### Coverage',
    '',
    `Cases cover ${data.coveredTools} of ${data.toolCount} tools. The rest are skipped on purpose:`,
    '',
    '| Tool | Why it is not benchmarked |',
    '|---|---|',
    ...data.skipped.map((s) => `| ${s.tool} | ${s.reason} |`),
    '',
    '### Cases',
    '',
    '| Case | Arguments | Model prompt |',
    '|---|---|---|',
    ...data.cases.map((c) => `| ${c.id} | \`${JSON.stringify(c.args).replace(/\|/g, '\\|')}\` | ${c.hasPrompt ? 'yes' : 'latency only'} |`),
    '',
  );
  return out;
}
