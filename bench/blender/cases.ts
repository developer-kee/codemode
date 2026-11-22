import type { CallSuite } from '../lib/calls.ts';
import { blender } from './index.ts';
import { blenderExec, resetScene } from './socket.ts';

export const blenderCalls: CallSuite = {
  id: 'blender',
  title: 'Blender',
  base: blender,
  async reset() {
    await resetScene();
    await blenderExec(`
import bpy
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
bpy.context.active_object.name = "Cube_A"
`);
  },
  preflight: blender.preflight,
  cases: [
    {
      id: 'get_addon_status',
      tool: 'get_addon_status',
      args: {},
      prompt: 'Check the connected Blender and tell me its version number in one short sentence.',
      expect: /5\.3/,
    },
    {
      id: 'get_scene_info',
      tool: 'get_scene_info',
      args: {},
      prompt: 'How many objects are in the Blender scene and what is each one called? Reply with one short sentence.',
      expect: /Cube_A/,
    },
    {
      id: 'execute_blender_code',
      tool: 'execute_blender_code',
      args: { code: "print('codemode-ok-4821')" },
      prompt: 'Run Python in Blender that prints the text codemode-ok-4821, then tell me exactly what it printed.',
      expect: /codemode-ok-4821/,
    },
    // Returns an image; measured for latency and payload size only (no model prompt: images are costly and scene-dependent).
    { id: 'look', tool: 'look', args: {} },
  ],
  skipped: [
    { tool: 'disable_telemetry', reason: 'Changes the upstream\'s settings; not a read.' },
    { tool: 'record_trajectory_feedback', reason: 'Writes feedback into the upstream\'s telemetry.' },
    { tool: 'generate_3d', reason: 'Calls a paid external generator and takes minutes.' },
    { tool: 'generate_gaussian_world', reason: 'Calls a paid external generator and takes minutes.' },
    { tool: 'search_assets', reason: 'Asset libraries are switched off in the test Blender; network-bound and non-deterministic.' },
    { tool: 'import_asset', reason: 'Downloads from external libraries; non-deterministic.' },
  ],
};
