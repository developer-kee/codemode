import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { generateApi } from './generate.ts';
import { runInSandbox } from './sandbox.ts';
import type { ServiceConfig, Upstream } from './types.ts';

const NAMESPACE = 'codemode';

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

async function listAllTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor === undefined ? {} : { cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return tools;
}

/** The `execute_code` tool description: guidance plus the generated TypeScript API. */
export function describeExecuteCode(dts: string, instructions = ''): string {
  return [
    `Write TypeScript that calls the \`${NAMESPACE}\` API below, in ONE script. Chain calls, loop, filter and`,
    'aggregate in code instead of making many separate calls; only what you `console.log()` or `return` comes back.',
    'The sandbox has no network, filesystem or imports; the API is the only way out. Top-level await is supported.',
    instructions,
    '',
    '```ts',
    dts,
    '```',
  ].join('\n');
}

export interface CodeModeServer {
  server: McpServer;
  client: Client;
  dts: string;
  close(): Promise<void>;
}

/** Build an MCP server exposing ONE tool, `execute_code`, over the upstream's tools. */
export async function createCodeModeServer(config: ServiceConfig): Promise<CodeModeServer> {
  const { name, upstream, limits, instructions = '' } = config;
  const client = await connectUpstream(upstream);
  const tools = await listAllTools(client);
  const { dts, names } = await generateApi(tools, NAMESPACE);

  const callTool = async (id: string, input: unknown): Promise<unknown> => {
    const toolName = Object.hasOwn(names, id) ? names[id] : undefined;
    if (toolName === undefined) throw new Error(`Unknown tool "${id}"`);
    const args = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
    const res = (await client.callTool({ name: toolName, arguments: args })) as CallToolResult;
    return unwrapResult(res);
  };

  const server = new McpServer({ name, version: '0.1.0' });
  server.registerTool(
    'execute_code',
    {
      description: describeExecuteCode(dts, instructions),
      inputSchema: { code: z.string().describe('TypeScript/JavaScript body to run') },
    },
    async ({ code }): Promise<CallToolResult> => {
      const out = await runInSandbox(
        code,
        { namespace: NAMESPACE, ids: Object.keys(names), callTool },
        limits,
      );
      const parts: string[] = [];
      if (out.logs.length > 0) parts.push(out.logs.join('\n'));
      if (out.result !== undefined) {
        parts.push(`result: ${typeof out.result === 'string' ? out.result : JSON.stringify(out.result, null, 2)}`);
      }
      if (out.error !== undefined) parts.push(`error: ${out.error}`);
      return {
        isError: out.error !== undefined,
        content: [{ type: 'text', text: parts.join('\n\n') || '(no output)' }],
      };
    },
  );

  return { server, client, dts, close: () => client.close() };
}

/** Serve a code-mode wrapper over stdio. */
export async function runCodeModeServer(config: ServiceConfig): Promise<void> {
  const { server, close } = await createCodeModeServer(config);
  await server.connect(new StdioServerTransport());
  process.on('SIGINT', () => {
    void close().finally(() => process.exit(0));
  });
}
