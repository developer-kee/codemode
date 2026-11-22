import type { ServiceConfig } from '../src/types.ts';

export default {
  name: 'blender',
  // Needs Blender open with the BlenderMCP addon connected (localhost:9876).
  upstream: { command: 'uvx', args: ['blender-mcp'] },
} satisfies ServiceConfig;
