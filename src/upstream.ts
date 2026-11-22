// Upstream transport: connect to an MCP server and turn its results into plain code values.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Upstream } from './types.ts';

/** Connect to the upstream MCP server (stdio command or streamable-HTTP url). */
export async function connectUpstream(upstream: Upstream): Promise<Client> {
  const client = new Client({ name: 'codemode', version: '0.1.0' });
  const transport =
    'url' in upstream
      ? new StreamableHTTPClientTransport(new URL(upstream.url), {
          requestInit: { headers: upstream.headers ?? {} },
        })
      : new StdioClientTransport({
          command: upstream.command,
          args: upstream.args ?? [],
          env: { ...(process.env as Record<string, string>), ...upstream.env },
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
