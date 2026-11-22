// Connections for the deterministic per-call benchmark: the same upstream, direct and through codemode.
import { fileURLToPath } from 'node:url';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { connectUpstream } from '../../../src/upstream.ts';
import type { BenchService, BenchVariant } from '../types/index.ts';

/** Repository root, from `bench/lib/calls/connect.ts`. */
const root = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Replace ${NAME} with the value of that environment variable. Benchmark configs use this form for secrets
 * (NOTION_TOKEN) so the token never lands in a file: Claude Code expands it itself, and this does the same here.
 */
export function expandEnv(env: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!env) return undefined;
  return Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v.replace(/\$\{(\w+)\}/g, (_, name: string) => process.env[name] ?? '')]));
}

export async function connectBoth(service: BenchService, variant: BenchVariant): Promise<{ direct: Client; codemode: Client }> {
  const direct = await connectUpstream({
    command: variant.direct.command,
    args: variant.direct.args,
    ...(variant.direct.env ? { env: expandEnv(variant.direct.env) ?? {} } : {}),
  });
  const codemode = await connectUpstream({
    command: process.execPath,
    args: [`${root}src/cli.ts`, service.id],
    ...(variant.codemodeEnv ? { env: expandEnv(variant.codemodeEnv) ?? {} } : {}),
  });
  return { direct, codemode };
}
