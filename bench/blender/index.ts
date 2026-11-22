import type { BenchService, Task } from '../lib/types.ts';
import { blenderExec, resetScene, seedScene, snapshotScene } from './socket.ts';
import { specs } from './tasks.ts';

const tasks: Task[] = specs.map((s) => ({
  id: s.id,
  prompt: s.prompt,
  seeded: s.seed !== undefined,
  async prepare() {
    await resetScene();
    if (s.seed) await seedScene(s.seed);
  },
  async verify(answer) {
    return s.verify(await snapshotScene(), answer);
  },
}));

export const blender: BenchService = {
  id: 'blender',
  title: 'Blender',
  direct: { server: 'blender', command: 'uvx', args: ['blender-mcp'] },
  systemPrompt:
    'You control a running Blender instance through the tools provided. Complete the task, then reply with one short sentence.',
  warning:
    'Every run WIPES the open Blender scene. Needs Blender open with the BlenderMCP addon connected (localhost:9876).',
  notes: [
    'Both paths drive the same live Blender through the same upstream (`blender-mcp`).',
    'The scene is reset before every run; pass/fail comes from a snapshot of the resulting scene (positions, sizes, names, materials), not from the model\'s claim.',
    'The test Blender had its asset libraries (Poly Haven, Sketchfab, ...) switched off, so search/import tasks are not included.',
    'The upstream `blender-mcp` sends its own telemetry on both paths; it was left on to keep the paths identical.',
  ],
  tasks,
  async preflight() {
    try {
      await blenderExec('print("ok")', 5000);
    } catch (e) {
      throw new Error(`Cannot reach Blender on localhost:9876 (is the BlenderMCP addon connected?): ${String(e)}`);
    }
  },
};
