import { mkdirSync, rmSync } from 'node:fs';
import { callsVariant } from '../../lib/calls/index.ts';
import type { BenchService, BenchVariant } from '../../lib/types/index.ts';
import { filesystemCalls } from './cases.ts';
import { makeTasks, SANDBOX } from './tasks.ts';

/** Both paths launch the same pinned server, confined to the sandbox folder. */
const scenarios: BenchVariant = {
  id: 'scenarios',
  title: 'multi-step scenario tasks',
  direct: {
    server: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem@2.4.0', SANDBOX],
  },
  codemodeEnv: { CODEMODE_FILESYSTEM_DIRS: SANDBOX },
  systemPrompt:
    'You work with files through the tools provided. Work only inside the folder named in the task. Complete the task, then reply with one short sentence.',
  notes: [
    'Both paths expose all 16 tools of the pinned `@modelcontextprotocol/server-filesystem@2.4.0`. The sandbox sits inside the benchmark\'s working directory because Claude Code passes that directory to the server as a root, which overrides the server\'s command-line directories (see `tasks.ts`); the direct path may therefore reach all of `bench/work/`, the codemode path only the sandbox.',
    'The `log-triage` task is the one built for code mode: 20 log files of 60 lines each must be read and counted, so a model working tool by tool pulls them all into context while a script returns only the counts.',
  ],
  tasks: makeTasks(SANDBOX),
};

export const filesystem: BenchService = {
  id: 'filesystem',
  title: 'Filesystem (reference MCP server)',
  warning:
    `Gives the model read and write access to ${SANDBOX}, which is deleted and recreated before every run, and to nothing else: the server is started with that single allowed directory. ` +
    'Nothing is downloaded except the pinned npm package.',
  notes: [
    'Pass/fail comes from inspecting the files left in the sandbox folder, not from the model\'s claim.',
    'Fully local and deterministic: no account, no network beyond installing the server package.',
  ],
  defaultVariant: 'scenarios',
  variants: [scenarios, callsVariant(scenarios, filesystemCalls)],
  calls: filesystemCalls,
  async preflight() {
    rmSync(SANDBOX, { recursive: true, force: true });
    mkdirSync(SANDBOX, { recursive: true });
  },
};
