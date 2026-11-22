import type { ServiceConfig } from '../../src/types.ts';
import { pythonServer } from '../../servers/resolve.ts';

export default {
  name: 'blender',
  // Needs Blender open with the BlenderMCP addon connected (localhost:9876).
  upstream: pythonServer('blender-mcp'),
  // It can run arbitrary Python in Blender (files, network), and search_assets/import_asset bring in outside content.
  capabilities: { privateData: true, untrustedContent: true, externalComms: true },
} satisfies ServiceConfig;
