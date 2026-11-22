// Latency: one call at a time, direct vs through codemode, with no model.
import { performance } from 'node:perf_hooks';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toIdentifier } from '../../../src/generate.ts';
import type { CallCase, CallDef } from '../types/index.ts';

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
