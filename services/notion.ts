import type { ServiceConfig } from '../src/types.ts';

export default {
  name: 'notion',
  // Needs NOTION_TOKEN in the environment of the MCP client config (never commit it).
  upstream: { command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'] },
} satisfies ServiceConfig;
