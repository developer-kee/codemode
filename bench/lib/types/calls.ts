import type { Verdict } from './task.ts';

/** One per-tool-call case: data only. Drives the deterministic benchmark and (with a prompt) the `calls` variant. */
export interface CallCase {
  /** Unique, e.g. `FileSystem.list` when one tool has several modes. */
  id: string;
  /** Upstream tool name. */
  tool: string;
  /** Arguments for the deterministic (no-model) latency measurement. */
  args: Record<string, unknown>;
  /** Calls made on each side before timing starts, for tools that need state (e.g. open a page before a snapshot). */
  before?: { tool: string; args: Record<string, unknown> }[];
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

/** The per-tool-call benchmark definition of a suite (`suites/<id>/cases.ts`). */
export interface CallDef {
  cases: CallCase[];
  /** Tools deliberately not benchmarked, with the reason. Everything else must have a case. */
  skipped: SkippedTool[];
  /** Put the tool's world into the known state the cases expect. */
  reset(): Promise<void>;
}
