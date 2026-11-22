// Tiny stdio MCP server used as a test upstream.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const s = new McpServer({ name: 'fake', version: '1.0.0' });
s.registerTool(
  'add-numbers',
  { description: 'Add two numbers', inputSchema: { a: z.number(), b: z.number() } },
  ({ a, b }) => ({ content: [{ type: 'text', text: JSON.stringify({ sum: a + b }) }] }),
);
s.registerTool('boom', { description: 'Always fails', inputSchema: {} }, () => ({
  isError: true,
  content: [{ type: 'text', text: 'kaboom' }],
}));
// Annotated tools, for the access-control tests.
s.registerTool(
  'get_thing',
  { description: 'Read a thing', inputSchema: {}, annotations: { readOnlyHint: true } },
  () => ({ content: [{ type: 'text', text: JSON.stringify({ thing: 1 }) }] }),
);
s.registerTool(
  'delete_thing',
  { description: 'Delete a thing', inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: true } },
  () => ({ content: [{ type: 'text', text: JSON.stringify({ deleted: true }) }] }),
);
s.registerTool(
  'big_text',
  { description: 'Return n characters', inputSchema: { n: z.number() }, annotations: { readOnlyHint: true } },
  ({ n }) => ({ content: [{ type: 'text', text: 'x'.repeat(n) }] }),
);
await s.connect(new StdioServerTransport());
