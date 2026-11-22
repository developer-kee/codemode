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
await s.connect(new StdioServerTransport());
