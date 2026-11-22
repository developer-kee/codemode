import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { BenchService } from '../lib/types.ts';
import { makeTasks } from './tasks.ts';

/** Every task works only inside this folder; the harness wipes and recreates it before each run. */
export const SANDBOX = `${tmpdir()}\\codemode-bench-windows`;

/** Non-visual tools only: no screenshots or input injection, and no registry access. */
export const TOOLS = 'FileSystem,PowerShell,Process,Wait';

export const windows: BenchService = {
  id: 'windows',
  title: 'Windows (Windows-MCP)',
  direct: { server: 'windows', command: 'uvx', args: ['windows-mcp', 'serve', '--tools', TOOLS] },
  codemodeEnv: { CODEMODE_WINDOWS_TOOLS: TOOLS },
  systemPrompt:
    'You control a Windows PC through the tools provided. Work only inside the folder named in the task and touch nothing else. Complete the task, then reply with one short sentence.',
  warning:
    `Gives the model real PowerShell and file access to this PC. Tasks are written to stay inside ${SANDBOX}, which is deleted and recreated before every run, but a model can still run arbitrary commands. Run on a machine you are happy to do that on.`,
  notes: [
    `Both paths expose the same four upstream tools (${TOOLS.split(',').join(', ')}), chosen so no run can capture the screen or send input to the desktop. The real server offers 20 tools, so tool-definition overhead is understated compared with a full install.`,
    'Pass/fail comes from inspecting the files left in the sandbox folder, not from the model\'s claim.',
    'Windows-MCP sends its own anonymous telemetry on both paths; it was left on to keep the paths identical.',
  ],
  tasks: makeTasks(SANDBOX),
  async preflight() {
    rmSync(SANDBOX, { recursive: true, force: true });
    mkdirSync(SANDBOX, { recursive: true });
  },
};
