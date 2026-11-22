import type { ServiceConfig } from '../src/types.ts';

// Notion's hosted MCP server (https://mcp.notion.com/mcp, about 85 tools). It signs in with OAuth, so there is no
// token in this file or in the MCP client config: run `npm run login -- notion-hosted` once, approve access in the
// browser, and the sign-in is kept in your user profile (see src/oauth.ts). The tool-definition lock still applies.
//
// This is a different server from `notion` (the self-hosted one, 24 tools, integration token). It reaches everything
// your Notion account can see, so it starts READ-ONLY: only tools the server marks `readOnlyHint: true` are offered.
// Set CODEMODE_NOTION_WRITE=1 to offer every tool, including those that create, edit and delete pages.
const writes = ['1', 'true'].includes(process.env['CODEMODE_NOTION_WRITE'] ?? '');

export default {
  name: 'notion-hosted',
  capabilities: { privateData: true, untrustedContent: true, externalComms: writes },
  upstream: { url: 'https://mcp.notion.com/mcp', oauth: { service: 'notion-hosted' } },
  ...(writes ? {} : { access: { readOnly: true } }),
} satisfies ServiceConfig;
