/** The objective outcome of one task's check. */
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
