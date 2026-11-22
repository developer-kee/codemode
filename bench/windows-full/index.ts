import type { BenchService } from '../lib/types.ts';
import { SANDBOX, windows } from '../windows/index.ts';
import { makeTasks } from '../windows/tasks.ts';

/**
 * Same tasks and checks as `windows`, but the model sees every tool Windows-MCP offers (20), the way a normal
 * install exposes it. This is the realistic tool-definition overhead.
 */
export const windowsFull: BenchService = {
  id: 'windows-full',
  wrapper: 'windows',
  title: 'Windows (Windows-MCP), all 20 tools',
  direct: { server: 'windows', command: 'uvx', args: ['windows-mcp', 'serve'] },
  // Empty = no whitelist, so the codemode wrapper exposes every upstream tool too.
  codemodeEnv: { CODEMODE_WINDOWS_TOOLS: '' },
  systemPrompt: windows.systemPrompt,
  warning:
    `Gives the model EVERY Windows-MCP tool: PowerShell, files, processes, registry, screenshots of your desktop (sent to the model API), and mouse and keyboard input. ` +
    `The tasks only need files, and the prompt says to stay inside ${SANDBOX} (wiped before every run), but nothing stops the model using the other tools. ` +
    'Do not run this with anything sensitive on screen or open.',
  notes: [
    'Same tasks, prompts and checks as the 4-tool Windows benchmark; the only change is that both paths expose all 20 Windows-MCP tools.',
    'Pass/fail comes from inspecting the files left in the sandbox folder, not from the model\'s claim.',
    'Check `toolNames` in the raw runs: any call to a screen or input tool means the model went beyond what the task needs.',
    'Windows-MCP sends its own anonymous telemetry on both paths; it was left on to keep the paths identical.',
  ],
  tasks: makeTasks(SANDBOX),
  preflight: windows.preflight,
};
