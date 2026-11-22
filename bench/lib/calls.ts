// Generic per-tool-call benchmarking. Works for any MCP: the only per-tool input is a list of cases (data).
//
//   static   what each tool's definition costs the model on every turn (direct) vs its slice of the typed API (codemode)
//   latency  one call at a time, direct vs through codemode's sandbox, many iterations, no model involved
//   model    one prompt per tool call, run through the normal harness (see makeCallService); optional, costs tokens
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { generateApi, toIdentifier } from '../../src/generate.ts';
import { connectUpstream, describeExecuteCode } from '../../src/server.ts';
import type { BenchService, Task, Verdict } from './types.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));

export interface CallCase {
  /** Unique, e.g. `FileSystem.list` when one tool has several modes. */
  id: string;
  /** Upstream tool name. */
  tool: string;
  /** Arguments for the deterministic (no-model) latency measurement. */
  args: Record<string, unknown>;
  /** Model-driven run: a prompt that makes the model make this one call. Omit to measure latency only. */
  prompt?: string;
  /** Model-driven run: pattern the model's answer must match. */
  expect?: RegExp;
  /** Model-driven run: custom check, for cases where the answer alone isn't proof. */
  check?(answer: string): Promise<Verdict>;
}

export interface SkippedTool {
  tool: string;
  reason: string;
}

/** Per-tool-call benchmark definition for one MCP. */
export interface CallSuite {
  id: string;
  title: string;
  /** Provides the upstream launch command and the codemode wrapper to compare. */
  base: BenchService;
  cases: CallCase[];
  /** Tools deliberately not benchmarked, with the reason. Everything else must have a case. */
  skipped: SkippedTool[];
  /** Put the tool's world into the known state the cases expect. */
  reset(): Promise<void>;
  preflight(): Promise<void>;
}

// ------------------------------------------------------------------------------------------------
// Model-driven: turn cases into tasks for the normal harness (run.ts), one task per tool call.
// ------------------------------------------------------------------------------------------------

export function makeCallService(suite: CallSuite): BenchService {
  const tasks: Task[] = suite.cases
    .filter((c) => c.prompt !== undefined && (c.expect !== undefined || c.check !== undefined))
    .map((c) => ({
      id: c.id,
      prompt: c.prompt ?? '',
      seeded: true,
      prepare: () => suite.reset(),
      async verify(answer: string): Promise<Verdict> {
        if (c.check) return c.check(answer);
        return c.expect?.test(answer)
          ? { pass: true, detail: 'ok' }
          : { pass: false, detail: `answer did not match ${String(c.expect)}: ${answer.slice(0, 80)}` };
      },
    }));
  return {
    ...suite.base,
    id: `${suite.id}-calls`,
    wrapper: suite.base.wrapper ?? suite.base.id,
    title: `${suite.title}, one tool call per task`,
    notes: [
      `Each task asks for exactly one upstream tool call (${tasks.length} of ${suite.cases.length} cases have a model prompt), so no single tool can dominate the totals and each tool is visible on its own row.`,
      'Same cases as the deterministic latency benchmark (`npm run bench:calls`), so a tool can be followed from definition cost, to raw latency, to model tokens.',
      ...suite.base.notes,
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
  codemodeChars: number;
}

export interface StaticCosts {
  rows: StaticRow[];
  directTotalChars: number;
  codemodeTotalChars: number;
  /** execute_code description boilerplate plus its input schema, paid once whatever the tool count. */
  codemodeFixedChars: number;
}

export async function staticCosts(tools: readonly Tool[], covered: ReadonlySet<string>): Promise<StaticCosts> {
  const { perTool, dts } = await generateApi(tools);
  const rows = tools.map((t): StaticRow => ({
    tool: t.name,
    covered: covered.has(t.name),
    // What an MCP client sends the model per tool: name, description, input schema.
    directChars: JSON.stringify({ name: t.name, description: t.description ?? '', input_schema: t.inputSchema }).length,
    codemodeChars: (perTool[toIdentifier(t.name)] ?? '').length,
  }));
  const fixed =
    describeExecuteCode('').length +
    JSON.stringify({ name: 'execute_code', input_schema: { type: 'object', properties: { code: { type: 'string' } } } }).length;
  return {
    rows,
    directTotalChars: rows.reduce((n, r) => n + r.directChars, 0),
    codemodeTotalChars: dts.length + fixed,
    codemodeFixedChars: fixed,
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
  suite: CallSuite,
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
  for (const c of suite.cases) {
    await suite.reset();
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

export async function connectBoth(base: BenchService): Promise<{ direct: Client; codemode: Client }> {
  const direct = await connectUpstream({
    command: base.direct.command,
    args: base.direct.args,
    ...(base.direct.env ? { env: base.direct.env } : {}),
  });
  const codemode = await connectUpstream({
    command: process.execPath,
    args: [`${root}src/cli.ts`, base.wrapper ?? base.id],
    ...(base.codemodeEnv ? { env: base.codemodeEnv } : {}),
  });
  return { direct, codemode };
}

// ------------------------------------------------------------------------------------------------
// Report
// ------------------------------------------------------------------------------------------------

const ms = (n: number): string => (n < 10 ? n.toFixed(1) : String(Math.round(n)));
const signed = (n: number): string => (n < 0 ? '-' : '+') + ms(Math.abs(n));
const tok = (chars: number): string => estimateTokens(chars).toLocaleString('en-US');

export function buildCallsReport(
  suite: CallSuite,
  costs: StaticCosts,
  latency: LatencyResult,
  meta: { date: string; iterations: number; toolCount: number },
): string {
  const out: string[] = [
    `# Per-tool-call benchmark: ${suite.title}`,
    '',
    'One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool\'s **definition** costs the model on every turn, how long **one call** takes directly versus through codemode\'s sandbox, and (optionally) the tokens a model spends making that one call (the `<tool>-calls` service in `npm run bench`). Method and caveats: [../README.md](../README.md).',
    '',
    `Generated ${meta.date}. ${meta.toolCount} upstream tools, ${suite.cases.length} cases over ${new Set(suite.cases.map((c) => c.tool)).size} tools, ${meta.iterations} timed iterations per case after one warm-up.`,
    `Reproduce: \`npm run bench:calls -- --service ${suite.id} --iters ${meta.iterations}\`.`,
    '',
    '## Definition cost per tool',
    '',
    'What the model is sent for each tool on **every turn**. `Direct` is the tool\'s name, description and input schema as JSON; `codemode` is that tool\'s slice of the generated TypeScript API. Tokens are estimated as characters / 4, good for comparing rows with each other, not an exact count.',
    '',
    '| Tool | Direct (≈ tokens) | Codemode (≈ tokens) | In per-call cases |',
    '|---|---|---|---|',
  ];
  for (const r of [...costs.rows].sort((a, b) => b.directChars - a.directChars)) {
    out.push(`| ${r.tool} | ${tok(r.directChars)} | ${tok(r.codemodeChars)} | ${r.covered ? 'yes' : 'no'} |`);
  }
  out.push(
    `| **Total** | **${tok(costs.directTotalChars)}** | **${tok(costs.codemodeTotalChars)}** (includes ${tok(costs.codemodeFixedChars)} fixed for \`execute_code\`) | |`,
    '',
    `The biggest single definition is ${tok(Math.max(...costs.rows.map((r) => r.directChars)))} tokens, ${(
      (Math.max(...costs.rows.map((r) => r.directChars)) / costs.directTotalChars) * 100
    ).toFixed(0)}% of the direct total.`,
    '',
    '> **Important: these two totals are what each side _tries_ to send, not what the model receives.** The codemode total is about the same size as the direct total because the generated TypeScript API carries the same information as the tool schemas. In Claude Code, though, an MCP tool description is cut at about 2,048 characters. Asking the model to quote its `execute_code` description (Blender) returned about 2,070 characters ending in "… [truncated]", and the first-turn context of codemode runs stays near 1.7k tokens for both Blender and Windows regardless of API size. The generated API lists the types first and the callable `codemode.*` members last, so the model sees the types of the first few tools and never the member list. Token savings measured by the model-driven benchmarks therefore include an unknown share that is **missing information**, not compression. Treat those savings as an upper bound until the description is restructured to fit the cap.',
    '',
    '## Latency per call (no model)',
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
    '## Coverage',
    '',
    `Cases cover ${new Set(suite.cases.map((c) => c.tool)).size} of ${meta.toolCount} tools. The rest are skipped on purpose:`,
    '',
    '| Tool | Why it is not benchmarked |',
    '|---|---|',
    ...suite.skipped.map((s) => `| ${s.tool} | ${s.reason} |`),
    '',
    '## Cases',
    '',
    '| Case | Arguments | Model prompt |',
    '|---|---|---|',
    ...suite.cases.map(
      (c) => `| ${c.id} | \`${JSON.stringify(c.args).replace(/\|/g, '\\|')}\` | ${c.prompt ? 'yes' : 'latency only'} |`,
    ),
    '',
  );
  return out.join('\n');
}



