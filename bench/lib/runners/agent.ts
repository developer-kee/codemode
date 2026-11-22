import type { BenchService, BenchVariant } from '../types/index.ts';

export type PathId = 'direct' | 'codemode';

export interface TurnUsage {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

/** One completed attempt of one task on one path, normalised across runners. */
export interface AgentRun {
  path: PathId;
  ok: boolean;
  error?: string;
  answer: string;
  turns: number;
  toolCalls: number;
  toolNames: string[];
  /** Tools visible to the model at start-up, when the runner can report them. */
  availableTools: string[];
  /** Context size on the first request: system prompt + tool definitions + task. */
  firstTurnContext: number;
  usage: TurnUsage;
  /** Reported spend. `undefined` when the runner does not report cost (e.g. subscription/account auth). */
  costUsd?: number;
  durationMs: number;
  /** Time spent waiting on the model API, when the runner reports it. */
  apiMs?: number;
}

export interface RunnerRunOptions {
  service: BenchService;
  variant: BenchVariant;
  path: PathId;
  model: string;
  prompt: string;
  budgetUsd: number;
  timeoutMs: number;
  /** Empty working directory, so no CLAUDE.md/AGENTS.md is picked up. */
  workDir: string;
}

/**
 * One way of driving a model with MCP tools. The benchmark is runner-agnostic: a new runner only has to
 * produce an {@link AgentRun}, and its model id decides which family section the reports put it in.
 */
export interface AgentRunner {
  /** Stable id stored on every record (`--runner`). */
  id: string;
  /** One line for the docs and report notes. */
  description: string;
  run(options: RunnerRunOptions): Promise<AgentRun>;
}
