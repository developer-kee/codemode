import { appendFileSync } from 'node:fs';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ajv } from 'ajv';
import { z } from 'zod';
import { compactIndex, describeExecuteCode, GET_API_DESCRIPTION, headerBudget, type CompactIndex } from './describe.ts';
import { filterTools } from './access.ts';
import { assignIdentifiers, generateApi } from './generate.ts';
import { createLimiter } from './limiter.ts';
import { capOutput } from './output.ts';
import { createStore } from './store.ts';
import { runInSandbox } from './sandbox.ts';
import { connectUpstream, listAllTools, unwrapResult } from './upstream.ts';
import type { ServiceConfig } from './types.ts';

const NAMESPACE = 'codemode';

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
  const maxConcurrentCalls = limits?.maxConcurrentCalls ?? 8;
  const maxOutputChars = limits?.maxOutputChars ?? 20_000;
  const store = createStore(limits?.maxStoreChars);
  const logFile = process.env['CODEMODE_LOG'];
  if (logFile) console.error(`[codemode] CODEMODE_LOG is set: every script and its result is appended in plain text to ${logFile}`);
  const client = await connectUpstream(upstream);
  const tools = filterTools(await listAllTools(client), config.access);
  const idOf = assignIdentifiers(tools.map((t) => t.name));
  const { dts, names, perTool } = await generateApi(tools, NAMESPACE, idOf);
  const index = compactIndex(tools, headerBudget(instructions), idOf);
  const description = describeExecuteCode(index, instructions);

  // Check arguments against each tool's JSON schema, so a wrong guess gets a precise error instead of an opaque one.
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const validators = new Map<string, ReturnType<Ajv['compile']>>();
  for (const t of tools) {
    try {
      validators.set(idOf(t.name), ajv.compile(t.inputSchema));
    } catch {
      /* unsupported schema keyword: skip validation for this tool */
    }
  }

  const makeCallTool = () => {
    let calls = 0;
    const limited = createLimiter(maxConcurrentCalls);
    return async (id: string, input: unknown, signal?: AbortSignal): Promise<unknown> => {
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
      const res = await limited(() => client.callTool({ name: toolName, arguments: args }, undefined, signal ? { signal } : {}));
      return unwrapResult(res as CallToolResult);
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
        { namespace: NAMESPACE, ids: Object.keys(names), callTool: makeCallTool(), syncCall: (id, input) => store.handle(id, input) },
        limits,
      );
      const parts: string[] = [];
      if (out.logs.length > 0) parts.push(out.logs.join('\n'));
      if (out.result !== undefined) {
        parts.push(`result: ${typeof out.result === 'string' ? out.result : JSON.stringify(out.result, null, 2)}`);
      }
      if (out.error !== undefined) parts.push(`error: ${out.error}`);
      const text = capOutput(parts.join('\n\n') || '(no output)', maxOutputChars);
      // Debugging aid, off by default: CODEMODE_LOG=<file> appends every script and what it returned.
      if (logFile) appendFileSync(logFile, `${JSON.stringify({ code, error: out.error, text: text.slice(0, 1500) })}\n`);
      return {
        isError: out.error !== undefined,
        content: [{ type: 'text', text }],
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
      // Accept the upstream name or the function name the index shows.
      const ids = wanted && wanted.length > 0 ? wanted.map((n) => (Object.hasOwn(perTool, n) ? n : idOf(n))) : Object.keys(perTool);
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
