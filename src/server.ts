import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { Ajv } from 'ajv';
import { z } from 'zod';
import { compactIndex, describeExecuteCode, GET_API_DESCRIPTION, headerBudget, type CompactIndex } from './describe.ts';
import { generateApi, toIdentifier } from './generate.ts';
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

export interface CodeModeServer {
  server: McpServer;
  client: Client;
  dts: string;
  /** What the execute_code description lists, and how detailed it is. */
  index: CompactIndex;
  /** The full execute_code description as sent to the client. */
  description: string;
  close(): Promise<void>;
}

/**
 * Build an MCP server over the upstream's tools with two tools of its own:
 * `execute_code` (run a script against the typed API) and `get_api` (look up full declarations on demand).
 */
export async function createCodeModeServer(config: ServiceConfig): Promise<CodeModeServer> {
  const { name, upstream, limits, instructions = '' } = config;
  const maxToolCalls = limits?.maxToolCalls ?? 100;
  const client = await connectUpstream(upstream);
  const tools = await listAllTools(client);
  const { dts, names, perTool } = await generateApi(tools, NAMESPACE);
  const index = compactIndex(tools, headerBudget(instructions));
  const description = describeExecuteCode(index, instructions);

  // Check arguments against each tool's JSON schema, so a wrong guess gets a precise error instead of an opaque one.
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const validators = new Map<string, ReturnType<Ajv['compile']>>();
  for (const t of tools) {
    try {
      validators.set(toIdentifier(t.name), ajv.compile(t.inputSchema));
    } catch {
      /* unsupported schema keyword: skip validation for this tool */
    }
  }

  const makeCallTool = () => {
    let calls = 0;
    return async (id: string, input: unknown): Promise<unknown> => {
      const toolName = Object.hasOwn(names, id) ? names[id] : undefined;
      if (toolName === undefined) {
        throw new Error(`Unknown tool "${id}". Available: ${Object.keys(names).join(', ')}`);
      }
      if (++calls > maxToolCalls) throw new Error(`Tool call limit reached (${maxToolCalls} per script)`);
      const args = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
      const validate = validators.get(id);
      if (validate && !validate(args)) {
        const why = ajv.errorsText(validate.errors, { dataVar: 'input' });
        throw new Error(`Invalid arguments for ${id}: ${why}. Expected: ${index.lines[id] ?? id}`);
      }
      const res = (await client.callTool({ name: toolName, arguments: args })) as CallToolResult;
      return unwrapResult(res);
    };
  };

  const server = new McpServer({ name, version: '0.1.0' });

  server.registerTool(
    'execute_code',
    {
      description,
      inputSchema: { code: z.string().describe('TypeScript/JavaScript body to run') },
    },
    async ({ code }): Promise<CallToolResult> => {
      const out = await runInSandbox(
        code,
        { namespace: NAMESPACE, ids: Object.keys(names), callTool: makeCallTool() },
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

  server.registerTool(
    'get_api',
    {
      description: GET_API_DESCRIPTION,
      inputSchema: {
        names: z.array(z.string()).optional().describe('Function names to describe; omit for all'),
      },
    },
    ({ names: wanted }): CallToolResult => {
      const ids = wanted && wanted.length > 0 ? wanted.map(toIdentifier) : Object.keys(perTool);
      const unknown = ids.filter((id) => !Object.hasOwn(perTool, id));
      if (unknown.length > 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown: ${unknown.join(', ')}. Available: ${Object.keys(perTool).join(', ')}` }],
        };
      }
      return { content: [{ type: 'text', text: ids.map((id) => perTool[id]).join('\n\n') }] };
    },
  );

  return { server, client, dts, index, description, close: () => client.close() };
}

/** Serve a code-mode wrapper over stdio. */
export async function runCodeModeServer(config: ServiceConfig): Promise<void> {
  const { server, close } = await createCodeModeServer(config);
  await server.connect(new StdioServerTransport());
  process.on('SIGINT', () => {
    void close().finally(() => process.exit(0));
  });
}
