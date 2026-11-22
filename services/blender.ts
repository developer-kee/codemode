import type { ServiceConfig } from '../src/types.ts';

export default {
  name: 'blender',
  // Needs Blender open with the BlenderMCP addon connected (localhost:9876).
  upstream: { command: 'uvx', args: ['blender-mcp@2.0.0'] },
} satisfies ServiceConfig;
