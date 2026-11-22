import type { ServiceConfig } from '../../src/types.ts';

// Notion's hosted MCP server (https://mcp.notion.com/mcp, 77 tools). It signs in with OAuth, so there is no token in
// this file or in the MCP client config: run `npm run login -- notion/oauth` once, approve access in the browser, and the
// sign-in is kept in your user profile (see src/oauth.ts). The tool-definition lock still applies.
//
// This is a different server from `notion/token` (the self-hosted one, 24 tools, integration token). It reaches
// everything your Notion account can see, and it can write: create, edit, move and delete pages, change comments and
// calendar events. Tools the server marks `destructiveHint: true` (update, delete, move, cancel, ...) are reported after
// every script that calls them, in the result and on stderr, so the model and you see what changed.
// Set CODEMODE_NOTION_READ_ONLY=1 to offer only the 39 tools the server marks `readOnlyHint: true`.
const readOnly = ['1', 'true'].includes(process.env['CODEMODE_NOTION_READ_ONLY'] ?? '');

export default {
  name: 'notion-oauth',
  capabilities: { privateData: true, untrustedContent: true, externalComms: !readOnly },
  instructions:
    'Reading is safe. Update, delete, move and cancel tools change existing data and are reported to the user after the script: use them only when asked, and say what you changed.',
  upstream: { url: 'https://mcp.notion.com/mcp', oauth: { service: 'notion-oauth' } },
  ...(readOnly ? { access: { readOnly: true } } : {}),
} satisfies ServiceConfig;
