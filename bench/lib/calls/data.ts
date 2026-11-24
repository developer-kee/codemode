// The `calls-latest.json` payload: what `bench:calls` records so reports can be rebuilt without rerunning.
import { portablePaths } from '../portable.ts';
import type { CallDef, SkippedTool } from '../types/index.ts';
import type { LatencyResult } from './latency.ts';
import type { StaticCosts } from './static.ts';

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
    // Arguments can hold absolute paths (a temp folder under the user's profile): record them as <path>, like the reports.
    cases: def.cases.map((c) => ({
      id: c.id,
      tool: c.tool,
      args: JSON.parse(portablePaths(JSON.stringify(c.args))) as Record<string, unknown>,
      hasPrompt: c.prompt !== undefined,
    })),
  };
}
