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

/** Everything the harness needs to benchmark one codemode service (a file in `services/`). */
export interface BenchService {
  /** Matches `services/<id>.ts`. */
  id: string;
  title: string;
  /** The upstream MCP server, exactly as a user would run it without codemode. */
  direct: DirectServer;
  /** Extra environment for the codemode wrapper, so both paths expose the same upstream tools. */
  codemodeEnv?: Record<string, string>;
  systemPrompt: string;
  /** What a reader must know before running this: side effects, prerequisites. */
  warning: string;
  /** Short prose for the generated report: what is held equal, what is excluded. */
  notes: string[];
  tasks: Task[];
  /** Throws a helpful error if the environment isn't ready (e.g. Blender not connected). */
  preflight(): Promise<void>;
}
