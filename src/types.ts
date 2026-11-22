import type { LockOptions } from './toollock.ts';

/** Upstream MCP server launched as a child process over stdio. */
export interface StdioUpstream {
  command: string;
  args?: string[];
  /** Variables set for the child process, on top of the safe default and `passEnv`. */
  env?: Record<string, string>;
  /** Names of the wrapper's own environment variables the child may see (for example `NOTION_TOKEN`). Nothing else is inherited. */
  passEnv?: string[];
}

/** Upstream MCP server reachable over streamable HTTP. */
export interface HttpUpstream {
  url: string;
  headers?: Record<string, string>;
  /**
   * The server signs in with OAuth. `service` names the saved sign-in (see `oauth.ts`); create it once with
   * `npm run login -- <service>`. Tokens are kept outside the repo and never appear in the service file.
   */
  oauth?: { service: string };
}

export type Upstream = StdioUpstream | HttpUpstream;

export interface SandboxLimits {
  /** Wall-clock budget for the whole script, including upstream calls. Default 60 000. */
  timeoutMs?: number;
  /** Guest heap cap in bytes. Default 128 MiB. */
  memoryBytes?: number;
  /** Max characters kept from console output. Default 100 000. */
  maxLogChars?: number;
  /** Max upstream tool calls per script, so a loop cannot fan out unchecked. Default 100. */
  maxToolCalls?: number;
  /** Max upstream calls running at the same time within one script (`Promise.all` fan-out). Default 8. */
  maxConcurrentCalls?: number;
  /** Max characters of the text `execute_code` returns to the model (head 70%, tail 30%). Default 20 000. */
  maxOutputChars?: number;
  /** Max size of one upstream result, in characters. A bigger one is refused with a message to ask for less, before it is copied into the sandbox. Default 10 000 000. */
  maxResultChars?: number;
  /** Max total size of the `store` across scripts, in characters of keys plus JSON. Default 1 048 576. */
  maxStoreChars?: number;
}

/** Which upstream tools become callable. Names are the upstream MCP tool names. */
export interface ToolAccess {
  /** If set, only these tools are exposed. */
  allow?: string[];
  /** These tools are never exposed; wins over `allow`. */
  deny?: string[];
  /** Keep only tools whose MCP annotations say `readOnlyHint: true`. Tools without annotations are excluded. */
  readOnly?: boolean;
}

/**
 * What a service can do to the model's situation, declared by whoever writes the service file. Used only to warn when
 * all three are present with no restriction (see `capabilities.ts`).
 */
export interface Capabilities {
  /** The tools can read the user's private data (files, accounts, workspaces). */
  privateData?: boolean;
  /** The tools return content written by others (web pages, documents, tickets). */
  untrustedContent?: boolean;
  /** The tools can send data out (network, messages, writes others can read). */
  externalComms?: boolean;
}

/** A service = one file in `services/` default-exporting this. */
export interface ServiceConfig {
  name: string;
  upstream: Upstream;
  /** Extra guidance appended to the `execute_code` tool description. */
  instructions?: string;
  limits?: SandboxLimits;
  access?: ToolAccess;
  capabilities?: Capabilities;
  /** Compare the upstream's tool definitions with a lock file (see `toollock.ts`). Set by the CLI. */
  lock?: LockOptions;
  /** Append a redacted audit trail (no code, arguments or results) to this file. Set by the CLI from CODEMODE_AUDIT. */
  auditFile?: string;
}

export interface SandboxApi {
  /** Global name the guest sees, e.g. `codemode`. */
  namespace: string;
  /** Identifiers exposed on the namespace. */
  ids: readonly string[];
  /** `signal` aborts when the script ends or times out, so a call it started cannot keep running unseen. */
  callTool(id: string, input: unknown, signal?: AbortSignal): Promise<unknown>;
  /** Host functions that finish immediately (the sandbox `store`); `handled: false` when `id` is not one. */
  syncCall?(id: string, input: unknown): { handled: false } | { handled: true; value: unknown };
}

export interface SandboxResult {
  logs: string[];
  result?: unknown;
  error?: string;
}

export interface GeneratedApi {
  /** TypeScript declarations for the namespace. */
  dts: string;
  /** Identifier -> original MCP tool name. */
  names: Record<string, string>;
  /** Identifier -> the declarations that tool contributes to `dts` (its types plus its member). */
  perTool: Record<string, string>;
}
