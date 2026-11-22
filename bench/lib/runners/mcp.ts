import { fileURLToPath } from 'node:url';
import type { BenchService, BenchVariant } from '../types.ts';
import type { PathId } from './agent.ts';

/** Repository root, from `bench/lib/runners/mcp.ts`. */
const root = fileURLToPath(new URL('../../../', import.meta.url));

/** How one path's MCP server is launched. Both runners use this, so the two paths stay comparable. */
export interface McpLaunch {
  /** MCP server name; becomes the `mcp__<name>__*` prefix in both Claude Code and DSH. */
  server: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** The upstream server used directly, or the codemode wrapper around the same upstream. */
export function mcpLaunch(service: BenchService, variant: BenchVariant, path: PathId): McpLaunch {
  if (path === 'direct') {
    const d = variant.direct;
    return { server: d.server, command: d.command, args: d.args, ...(d.env ? { env: d.env } : {}) };
  }
  return {
    server: `${service.id}-cm`,
    command: process.execPath,
    args: [`${root}src/cli.ts`, service.id],
    ...(variant.codemodeEnv ? { env: variant.codemodeEnv } : {}),
  };
}
