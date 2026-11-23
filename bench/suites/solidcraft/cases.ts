import type { CallDef } from '../../lib/types/index.ts';

// SolidCraft's read-only tools, one call each, against whatever design the session has (a fresh headless session is
// empty). No model prompts: the benchmark records sizes and timings only. State-changing tools are not timed, so the
// run never edits a design, and `screenshot` and `compare_picture` return images that the code API leaves out.
export const solidcraftCalls: CallDef = {
  async reset() {
    // Read-only: nothing to put back.
  },
  cases: [
    { id: 'version', tool: 'version', args: {} },
    { id: 'list_commands', tool: 'list_commands', args: { filter: 'fillet', limit: 5 } },
    { id: 'describe_command', tool: 'describe_command', args: { id: 'solid.box' } },
    { id: 'skill_reference', tool: 'skill_reference', args: { skill: 'solidcraft-modeling' } },
    { id: 'inspect_design', tool: 'inspect_design', args: { measure: false, sketches: false } },
    { id: 'measure', tool: 'measure', args: {} },
    { id: 'running', tool: 'running', args: {} },
    { id: 'pending', tool: 'pending', args: {} },
    { id: 'crash_reports', tool: 'crash_reports', args: { limit: 3 } },
  ],
  skipped: [
    ...['execute', 'batch', 'set_parameter', 'check_parameters', 'new_design', 'open', 'save', 'export', 'undo', 'redo', 'cancel'].map((tool) => ({
      tool,
      reason: 'Changes the design, files or the running app, so it is not timed against a live install.',
    })),
    { tool: 'body_topology', reason: 'Needs a body id from a design that has one; the benchmark session is empty.' },
    { tool: 'screenshot', reason: 'Returns an image, which a script cannot show the model; left out of the code API.' },
    { tool: 'compare_picture', reason: 'Takes and returns images; left out of the code API.' },
  ],
};
