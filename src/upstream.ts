// Upstream transport: connect to an MCP server and turn its results into plain code values.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Upstream } from './types.ts';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Credentials and tool results travel over this connection, so plain http is only acceptable on this machine. */
export function assertSecureUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.has(u.hostname))) {
    throw new Error(`Refusing to connect to ${u.origin}: use https, or http only for localhost.`);
  }
  return u;
}

/**
 * The environment an upstream process gets: the SDK's small safe default (PATH, home and temp folders), the
 * variables the service names in `passEnv`, then `env`. The wrapper's other variables, which may hold unrelated
 * secrets, never reach the upstream.
 */
export function upstreamEnv(upstream: { env?: Record<string, string>; passEnv?: string[] }): Record<string, string> {
  const passed: Record<string, string> = {};
  for (const name of upstream.passEnv ?? []) {
    const value = process.env[name];
    if (value !== undefined) passed[name] = value;
  }
  return { ...getDefaultEnvironment(), ...passed, ...upstream.env };
}

/** Connect to the upstream MCP server (stdio command or streamable-HTTP url). */
export async function connectUpstream(upstream: Upstream): Promise<Client> {
  const client = new Client({ name: 'codemode', version: '0.1.0' });
  const transport =
    'url' in upstream
      ? new StreamableHTTPClientTransport(assertSecureUrl(upstream.url), {
          requestInit: { headers: upstream.headers ?? {} },
        })
      : new StdioClientTransport({
          command: upstream.command,
          args: upstream.args ?? [],
          env: upstreamEnv(upstream),
          stderr: 'inherit',
        });
  await client.connect(transport);
  return client;
}

/** Collapse an MCP CallToolResult into something pleasant to use from code. */
export function unwrapResult(res: CallToolResult): unknown {
  const content = res.content;
  if (res.isError) {
    const msg = content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
    throw new Error(msg || 'tool error');
  }
  if (res.structuredContent !== undefined) return res.structuredContent;
  const texts: string[] = [];
  for (const c of content) {
    if (c.type !== 'text') return content; // images etc. pass through untouched
    texts.push(c.text);
  }
  if (texts.length === 0) return content;
  const text = texts.join('\n');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Every tool the upstream offers, following pagination. */
export async function listAllTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor === undefined ? {} : { cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return tools;
}
