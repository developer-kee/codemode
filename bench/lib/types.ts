export interface Verdict {
  pass: boolean;
  detail: string;
}

/** One benchmark task for one tool. Owns its own setup and its own objective check. */
export interface Task {
  id: string;
  /** Identical text for both paths; never mentions tool names. */
  prompt: string;
  /** True when the task starts from pre-built content rather than an empty slate. */
  seeded: boolean;
  /** Reset the tool's world to a known state (and seed it). Runs before every attempt. */
  prepare(): Promise<void>;
  /** Inspect the world afterwards and decide pass/fail. `answer` is the model's final text. */
  verify(answer: string): Promise<Verdict>;
}

export interface DirectServer {
  /** MCP server name; becomes the `mcp__<name>__*` prefix. */
  server: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

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

/** The per-tool-call benchmark definition of a service (`<service>/cases.ts`). */
export interface CallDef {
  cases: CallCase[];
  /** Tools deliberately not benchmarked, with the reason. Everything else must have a case. */
  skipped: SkippedTool[];
  /** Put the tool's world into the known state the cases expect. */
  reset(): Promise<void>;
}

/** One way of running a service's benchmark: which upstream tools are exposed and which tasks are asked. */
export interface BenchVariant {
  /** Stored as `variant` on every run record and passed as `--variant`. */
  id: string;
  /** One line for the report heading. */
  title: string;
  /** The upstream MCP server, exactly as a user would run it without codemode. */
  direct: DirectServer;
  /** Extra environment for the codemode wrapper, so both paths expose the same upstream tools. */
  codemodeEnv?: Record<string, string>;
  systemPrompt: string;
  /** Variant-specific warning, printed before a run and in the report (in addition to the service warning). */
  warning?: string;
  /** Variant-specific report notes (what this variant exposes). */
  notes: string[];
  tasks: Task[];
}

/** Everything the harness needs to benchmark one codemode service (a file in `services/`). */
export interface BenchService {
  /** Names the results folder (`bench/<id>/`) and matches `services/<id>.ts`. */
  id: string;
  title: string;
  /** What a reader must know before running this: side effects, prerequisites. */
  warning: string;
  /** Short prose for the generated report: what is held equal, what is excluded. Applies to every variant. */
  notes: string[];
  /** The variant used when `--variant` is not given, and the one the deterministic `bench:calls` run connects to. */
  defaultVariant: string;
  variants: BenchVariant[];
  /** Per-tool-call cases; becomes the `calls` variant and the `bench:calls` benchmark. */
  calls: CallDef;
  /** Throws a helpful error if the environment isn't ready (e.g. Blender not connected). */
  preflight(): Promise<void>;
}
