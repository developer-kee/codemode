import type { ServiceConfig } from '../src/types.ts';

// The official Notion MCP server, https://github.com/makenotion/notion-mcp-server (npm: @notionhq/notion-mcp-server),
// pinned for reproducible results. 23 tools, each with a large schema (about 76,000 characters in total).
//
// Authentication: create an internal integration at https://www.notion.so/profile/integrations, share the pages it
// should see with it, and put its token in NOTION_TOKEN in the environment of the MCP client config. Never commit it.
// The integration can only reach pages that were shared with it.
//
// This wrapper can create, edit and trash pages. Restrict it with `access` (or `--read-only`) if it should only look.
export default {
  name: 'notion',
  // Private pages, text others wrote, and pages that others can read; no network access beyond Notion itself.
  capabilities: { privateData: true, untrustedContent: true, externalComms: false },
  // Only NOTION_TOKEN is handed to the server; the wrapper's other environment variables are not.
  upstream: { command: 'npx', args: ['-y', '@notionhq/notion-mcp-server@2.6.1'], passEnv: ['NOTION_TOKEN'] },
} satisfies ServiceConfig;
