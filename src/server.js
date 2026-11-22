import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { generateApi } from './generate.js';
import { runInSandbox } from './sandbox.js';

const NAMESPACE = 'codemode';

/** Connect to the upstream MCP server (stdio command or streamable-HTTP url). */
export async function connectUpstream(upstream) {
  const client = new Client({ name: 'codemode-core', version: '0.1.0' });
  const transport = upstream.url
    ? new StreamableHTTPClientTransport(new URL(upstream.url), { requestInit: { headers: upstream.headers } })
    : new StdioClientTransport({
        command: upstream.command,
        args: upstream.args ?? [],
        env: { ...process.env, ...(upstream.env ?? {}) },
        stderr: 'inherit',
      });
  await client.connect(transport);
  return client;
}

/** Collapse an MCP CallToolResult into something pleasant to use from code. */
export function unwrapResult(res) {
  if (res.isError) {
    const msg = (res.content ?? []).map((c) => c.text ?? '').join('\n') || 'tool error';
    throw new Error(msg);
  }
  if (res.structuredContent !== undefined) return res.structuredContent;
  const content = res.content ?? [];
  if (content.length > 0 && content.every((c) => c.type === 'text')) {
    const text = content.map((c) => c.text).join('\n');
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return content; // images etc. pass through untouched
}

async function listAllTools(client) {
  const tools = [];
  let cursor;
  do {
    const page = await client.listTools({ cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

/**
 * Build an MCP server exposing ONE tool, `execute_code`, over the upstream's tools.
 * Returns { server, client, dts, close }.
 */
export async function createCodeModeServer({ name, upstream, limits, instructions = '' }) {
  const client = await connectUpstream(upstream);
  const tools = await listAllTools(client);
  const { dts, names } = await generateApi(tools, NAMESPACE);

  const callTool = async (id, input) => {
    const toolName = names[id];
    if (!toolName) throw new Error(`Unknown tool "${id}"`);
    return unwrapResult(await client.callTool({ name: toolName, arguments: input }));
  };

  const server = new McpServer({ name, version: '0.1.0' });
  server.registerTool(
    'execute_code',
    {
      description: [
        `Write TypeScript that calls the \`${NAMESPACE}\` API below, in ONE script. Chain calls, loop, filter and`,
        'aggregate in code instead of making many separate calls; only what you `console.log()` or `return` comes back.',
        'The sandbox has no network, filesystem or imports; the API is the only way out. Top-level await is supported.',
        instructions,
        '',
        '```ts',
        dts,
        '```',
      ].join('\n'),
      inputSchema: { code: z.string().describe('TypeScript/JavaScript body to run') },
    },
    async ({ code }) => {
      const out = await runInSandbox(code, { namespace: NAMESPACE, ids: Object.keys(names), callTool }, limits);
      const parts = [];
      if (out.logs.length) parts.push(out.logs.join('\n'));
      if (out.result !== undefined) {
        parts.push(`result: ${typeof out.result === 'string' ? out.result : JSON.stringify(out.result, null, 2)}`);
      }
      if (out.error) parts.push(`error: ${out.error}`);
      return {
        isError: Boolean(out.error),
        content: [{ type: 'text', text: parts.join('\n\n') || '(no output)' }],
      };
    },
  );

  return { server, client, dts, close: () => client.close() };
}

/** Entry point for a service repo: serve the code-mode wrapper over stdio. */
export async function runCodeModeServer(opts) {
  const { server, close } = await createCodeModeServer(opts);
  await server.connect(new StdioServerTransport());
  process.on('SIGINT', async () => {
    await close();
    process.exit(0);
  });
}
