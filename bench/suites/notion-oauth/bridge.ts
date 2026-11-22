// The "direct" side of the Notion OAuth benchmark: a stdio MCP server that passes every call straight to Notion's
// hosted server using the saved sign-in (`npm run login -- notion/oauth`). The benchmark harness and Claude Code can only
// start stdio servers, and the hosted server needs OAuth, so this is the plain, unwrapped path. It adds no logic: it
// forwards `tools/list` and `tools/call`, and offers the same read-only tools the codemode wrapper does, so both paths
// expose an identical set.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { connectUpstream, listAllTools } from '../../../src/upstream.ts';

const upstream = await connectUpstream({ url: 'https://mcp.notion.com/mcp', oauth: { service: 'notion-oauth' } });
const tools = (await listAllTools(upstream)).filter((t) => t.annotations?.readOnlyHint === true);
const allowed = new Set(tools.map((t) => t.name));

const server = new Server({ name: 'notion-oauth-direct', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!allowed.has(request.params.name)) throw new Error(`Unknown tool: ${request.params.name}`);
  return (await upstream.callTool(request.params)) as CallToolResult;
});
await server.connect(new StdioServerTransport());
