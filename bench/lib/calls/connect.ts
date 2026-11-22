// Connections for the deterministic per-call benchmark: the same upstream, direct and through codemode.
import { fileURLToPath } from 'node:url';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { connectUpstream } from '../../../src/upstream.ts';
import type { BenchService, BenchVariant } from '../types.ts';

/** Repository root, from `bench/lib/calls/connect.ts`. */
const root = fileURLToPath(new URL('../../../', import.meta.url));

export async function connectBoth(service: BenchService, variant: BenchVariant): Promise<{ direct: Client; codemode: Client }> {
  const direct = await connectUpstream({
    command: variant.direct.command,
    args: variant.direct.args,
    ...(variant.direct.env ? { env: variant.direct.env } : {}),
  });
  const codemode = await connectUpstream({
    command: process.execPath,
    args: [`${root}src/cli.ts`, service.id],
    ...(variant.codemodeEnv ? { env: variant.codemodeEnv } : {}),
  });
  return { direct, codemode };
}
