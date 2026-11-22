// Audit log: what ran and what it called, without the data. One JSON line per event.
//
// Recorded: timestamps, durations, tool names, outcomes, error classes, and SHA-256 prefixes of scripts and arguments
// (so two events can be matched without storing them). Never recorded: script text, argument values, results, error text.
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

export type ErrorKind = 'validation' | 'limit' | 'result-too-large' | 'unknown-tool' | 'aborted' | 'upstream' | 'timeout' | 'script';

export function classifyError(message: string): ErrorKind {
  if (/^Invalid arguments for /.test(message)) return 'validation';
  if (/^Tool call limit reached/.test(message)) return 'limit';
  if (/limit for one result/.test(message)) return 'result-too-large';
  if (/^Unknown tool /.test(message)) return 'unknown-tool';
  if (/timed out/i.test(message)) return 'timeout';
  if (/abort/i.test(message)) return 'aborted';
  return 'upstream';
}

export interface CallEvent {
  script: string;
  tool: string;
  args: unknown;
  ms: number;
  error?: ErrorKind;
}

export interface ScriptEvent {
  script: string;
  code: string;
  ms: number;
  calls: number;
  outputChars: number;
  error?: ErrorKind;
}

export interface Audit {
  readonly enabled: boolean;
  newScriptId(): string;
  call(e: CallEvent): void;
  script(e: ScriptEvent): void;
}

const digest = (v: unknown): string =>
  createHash('sha256').update(typeof v === 'string' ? v : (JSON.stringify(v) ?? 'null')).digest('hex').slice(0, 16);

/** A logger that appends to `file`, or does nothing when `file` is undefined. */
export function createAudit(file: string | undefined, say: (line: string) => void = console.error): Audit {
  const session = createHash('sha256').update(`${process.pid}-${Date.now()}-${Math.random()}`).digest('hex').slice(0, 8);
  let counter = 0;
  let warned = false;
  const write = (event: Record<string, unknown>): void => {
    if (!file) return;
    try {
      appendFileSync(file, `${JSON.stringify({ t: new Date().toISOString(), session, ...event })}\n`);
    } catch (e) {
      if (!warned) say(`[codemode] cannot write the audit log ${file}: ${String(e)}`);
      warned = true;
    }
  };
  return {
    enabled: file !== undefined,
    newScriptId: () => `s${++counter}`,
    call: (e) =>
      write({
        type: 'call',
        script: e.script,
        tool: e.tool,
        argKeys: e.args !== null && typeof e.args === 'object' ? Object.keys(e.args).sort() : [],
        argsSha: digest(e.args),
        ms: Math.round(e.ms),
        outcome: e.error ? 'error' : 'ok',
        ...(e.error ? { error: e.error } : {}),
      }),
    script: (e) =>
      write({
        type: 'script',
        script: e.script,
        codeSha: digest(e.code),
        codeChars: e.code.length,
        ms: Math.round(e.ms),
        calls: e.calls,
        outputChars: e.outputChars,
        outcome: e.error ? 'error' : 'ok',
        ...(e.error ? { error: e.error } : {}),
      }),
  };
}
