import { mkdirSync, rmSync } from 'node:fs';
import { callsVariant } from '../lib/calls.ts';
import type { BenchService, BenchVariant } from '../lib/types.ts';
import { windowsCalls } from './cases.ts';
import { makeTasks, SANDBOX } from './tasks.ts';

/** The four non-visual tools of the original benchmark: no screenshots or input injection, and no registry access. */
export const TOOLS_4 = 'FileSystem,PowerShell,Process,Wait';

const systemPrompt =
  'You control a Windows PC through the tools provided. Work only inside the folder named in the task and touch nothing else. Complete the task, then reply with one short sentence.';

/** Every tool Windows-MCP offers (20), the way a normal install exposes it: the realistic tool-definition overhead. */
const scenarios: BenchVariant = {
  id: 'scenarios',
  title: 'multi-step scenario tasks, all 20 tools',
  direct: { server: 'windows', command: 'uvx', args: ['windows-mcp', 'serve'] },
  // Empty = no whitelist, so the codemode wrapper exposes every upstream tool too.
  codemodeEnv: { CODEMODE_WINDOWS_TOOLS: '' },
  systemPrompt,
  warning:
    'Gives the model EVERY Windows-MCP tool: PowerShell, files, processes, registry, screenshots of your desktop (sent to the model API), and mouse and keyboard input. ' +
    `The tasks only need files, and the prompt says to stay inside ${SANDBOX} (wiped before every run), but nothing stops the model using the other tools. ` +
    'Do not run this with anything sensitive on screen or open.',
  notes: [
    'Both paths expose all 20 Windows-MCP tools, as a normal install does, so tool-definition overhead is realistic.',
    'Check `toolNames` in the raw runs: any call to a screen or input tool means the model went beyond what the task needs.',
  ],
  tasks: makeTasks(SANDBOX),
};

/** Same tasks and checks, but only four tools are exposed on both paths. Understates the schema overhead. */
const scenarios4: BenchVariant = {
  id: 'scenarios-4-tools',
  title: 'multi-step scenario tasks, 4 non-visual tools',
  direct: { server: 'windows', command: 'uvx', args: ['windows-mcp', 'serve', '--tools', TOOLS_4] },
  codemodeEnv: { CODEMODE_WINDOWS_TOOLS: TOOLS_4 },
  systemPrompt,
  notes: [
    `Both paths expose the same four upstream tools (${TOOLS_4.split(',').join(', ')}), chosen so no run can capture the screen or send input to the desktop. The real server offers 20 tools, so tool-definition overhead is understated compared with a full install (see \`scenarios\`).`,
  ],
  tasks: makeTasks(SANDBOX),
};

export const windows: BenchService = {
  id: 'windows',
  title: 'Windows (Windows-MCP)',
  warning:
    `Gives the model real PowerShell and file access to this PC. Tasks are written to stay inside ${SANDBOX}, which is deleted and recreated before every run, but a model can still run arbitrary commands. Run on a machine you are happy to do that on. ` +
    'The `scenarios` and `calls` variants expose every tool, including screenshots and input: see their warning.',
  notes: [
    'Pass/fail comes from inspecting the files left in the sandbox folder, not from the model\'s claim.',
    'Windows-MCP sends its own anonymous telemetry on both paths; it was left on to keep the paths identical.',
  ],
  defaultVariant: 'scenarios',
  variants: [scenarios, scenarios4, callsVariant(scenarios, windowsCalls)],
  calls: windowsCalls,
  async preflight() {
    rmSync(SANDBOX, { recursive: true, force: true });
    mkdirSync(SANDBOX, { recursive: true });
  },
};
