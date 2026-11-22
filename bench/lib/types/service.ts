import type { CallDef } from './calls.ts';
import type { Task } from './task.ts';

export interface DirectServer {
  /** MCP server name; becomes the `mcp__<name>__*` prefix. */
  server: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
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

/** Everything the harness needs to benchmark one codemode suite (a folder in `bench/suites/`). */
export interface BenchService {
  /** Names the suite folder (`bench/suites/<id>/`) and matches `services/<id>.ts` unless `wrapper` says otherwise. */
  id: string;
  /** The service the wrapper CLI runs, when it is not named like the suite (`notion/token` for the `notion` suite). */
  wrapper?: string;
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
