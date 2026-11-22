/** Upstream MCP server launched as a child process over stdio. */
export interface StdioUpstream {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Upstream MCP server reachable over streamable HTTP. */
export interface HttpUpstream {
  url: string;
  headers?: Record<string, string>;
}

export type Upstream = StdioUpstream | HttpUpstream;

export interface SandboxLimits {
  /** Wall-clock budget for the whole script, including upstream calls. Default 60 000. */
  timeoutMs?: number;
  /** Guest heap cap in bytes. Default 128 MiB. */
  memoryBytes?: number;
  /** Max characters kept from console output. Default 100 000. */
  maxLogChars?: number;
}

/** A service = one file in `services/` default-exporting this. */
export interface ServiceConfig {
  name: string;
  upstream: Upstream;
  /** Extra guidance appended to the `execute_code` tool description. */
  instructions?: string;
  limits?: SandboxLimits;
}

export interface SandboxApi {
  /** Global name the guest sees, e.g. `codemode`. */
  namespace: string;
  /** Identifiers exposed on the namespace. */
  ids: readonly string[];
  callTool(id: string, input: unknown): Promise<unknown>;
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
