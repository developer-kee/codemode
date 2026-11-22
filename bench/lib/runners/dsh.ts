import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AgentRun, AgentRunner, RunnerRunOptions, TurnUsage } from './agent.ts';
import { mcpLaunch } from './mcp.ts';

/**
 * DSH plugins that contribute tools or agent-facing instructions. The benchmark exposes only the MCP
 * server under test, so every built-in tool is switched off on both paths.
 */
const DISABLED_PLUGINS = [
  // built-in tools
  'tool-plugin-manager',
  'tool-working-directory',
  'tool-bash',
  'tool-pwsh',
  'tool-jobs',
  'tool-fs',
  'tool-fs-search',
  'tool-skill',
  'tool-agent-team',
  'tool-subagent-control',
  'tool-subagent',
  'tool-subagent-fork',
  'tool-workflow',
  'tool-todo',
  'tool-goal',
  'tool-web',
  // services and prompts that would otherwise shape the run
  'agent-instructions',
  'skill',
  'skill-filesystem',
  'goal',
  'goal-round-driver',
  'command-goal',
  'plan-mode',
  'subagent',
  'agent-team',
  'subagent-spawn-in-process',
  'subagent-fork-in-process',
  'workflow-ptc',
  'repeat-tool-reminder',
];

const isWindows = process.platform === 'win32';

/** Locate the `dsh` launcher: `DSH_BIN`, the running Desktop install, or PATH. */
function dshCommand(): string {
  const explicit = process.env['DSH_BIN']?.trim();
  if (explicit) return explicit;
  const desktop = process.env['DSH_NODE_EXECUTABLE']?.trim();
  if (desktop) {
    const candidate = join(dirname(desktop), 'resources', 'runtime', 'cli', 'bin', isWindows ? 'dsh.cmd' : 'dsh');
    if (existsSync(candidate)) return candidate;
  }
  return isWindows ? 'dsh.cmd' : 'dsh';
}

/** The `--patch` overlay: account provider, our model, our system prompt, no built-in tools, one MCP server. */
function patchRows(opts: RunnerRunOptions): object[] {
  const launch = mcpLaunch(opts.service, opts.variant, opts.path);
  const provider = process.env['DSH_BENCH_PROVIDER']?.trim() || 'deepseek-account';
  const reasoningEffort = process.env['DSH_BENCH_REASONING']?.trim() || 'high';
  return [
    { id: 'authorization', disabled: false },
    { id: 'deepseek-account', disabled: false },
    { id: 'credentials', disabled: false },
    { id: 'agent-default-model', config: { provider, model: opts.model, reasoningEffort } },
    { id: 'system-prompt', config: { personaPrefix: opts.variant.systemPrompt } },
    ...DISABLED_PLUGINS.map((id) => ({ id, disabled: true })),
    {
      insert: [
        {
          id: 'mcp-bench',
          name: '@deepseek-ai/dsh-mcp-client',
          config: {
            transport: 'stdio',
            serverName: launch.server,
            command: launch.command,
            args: launch.args,
            env: launch.env ?? {},
            failOnStartupError: true,
            toolCallTimeoutMs: Math.max(60_000, opts.timeoutMs),
          },
        },
      ],
    },
  ];
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

function addUsage(total: TurnUsage, u: unknown): TurnUsage {
  const o = (u ?? {}) as Record<string, unknown>;
  return {
    input: total.input + num(o['inputTokens']),
    cacheWrite: total.cacheWrite + num(o['cacheWriteTokens']),
    cacheRead: total.cacheRead + num(o['cacheReadTokens']),
    output: total.output + num(o['outputTokens']),
  };
}

/** Run one prompt through `dsh headless --json` and normalise its events. */
function runDsh(opts: RunnerRunOptions): Promise<AgentRun> {
  mkdirSync(opts.workDir, { recursive: true });
  const patchFile = `${opts.workDir}dsh-${opts.service.id}-${opts.variant.id}-${opts.path}.json`;
  writeFileSync(patchFile, `${JSON.stringify(patchRows(opts), null, 2)}\n`);

  const command = dshCommand();
  const args = ['headless', '--patch', patchFile, '--json', '--approval-policy', 'never', '-'];
  const q = (s: string): string => (/\s/.test(s) ? `"${s}"` : s);
  const child = isWindows
    ? spawn([command, ...args].map(q).join(' '), { shell: true, cwd: opts.workDir, stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn(command, args, { cwd: opts.workDir, stdio: ['pipe', 'pipe', 'pipe'] });

  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      stderr += '\n[harness] timeout, killing';
      if (isWindows) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      else child.kill('SIGKILL');
    }, opts.timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    child.stdin.on('error', () => {
      /* the child can exit before reading the task; its stderr/events explain why */
    });
    child.stdin.end(opts.prompt);
    child.on('error', (err) => {
      clearTimeout(timer);
      rmSync(patchFile, { force: true });
      resolve({
        path: opts.path,
        ok: false,
        error: `could not start DSH (${command}): ${err.message}`,
        answer: '',
        turns: 0,
        toolCalls: 0,
        toolNames: [],
        availableTools: [],
        firstTurnContext: 0,
        usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
        durationMs: Date.now() - started,
      });
    });
    child.on('close', () => {
      clearTimeout(timer);
      rmSync(patchFile, { force: true });
      const run: AgentRun = {
        path: opts.path,
        ok: false,
        answer: '',
        turns: 0,
        toolCalls: 0,
        toolNames: [],
        availableTools: [],
        firstTurnContext: 0,
        usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
        durationMs: Date.now() - started,
      };
      let sawFinal = false;
      for (const line of stdout.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        const type = ev['type'];
        if (type === 'status' && ev['phase'] === 'step_end') {
          run.usage = addUsage(run.usage, ev['usage']);
          run.turns = Math.max(run.turns, num(ev['step']));
          if (run.firstTurnContext === 0) {
            const u = (ev['usage'] ?? {}) as Record<string, unknown>;
            run.firstTurnContext = num(u['inputTokens']) + num(u['cacheWriteTokens']) + num(u['cacheReadTokens']);
          }
        } else if (type === 'tool_call') {
          run.toolCalls++;
          run.toolNames.push(String(ev['tool']));
        } else if (type === 'final') {
          sawFinal = true;
          run.answer = typeof ev['text'] === 'string' ? ev['text'] : '';
          const reason = (ev['reason'] ?? {}) as Record<string, unknown>;
          run.ok = reason['kind'] === 'completed';
          if (!run.ok) {
            const error = (reason['error'] ?? {}) as Record<string, unknown>;
            run.error = String(error['message'] ?? reason['kind'] ?? 'error');
          }
        }
      }
      if (!sawFinal) run.error = `no final event; stderr: ${stderr.slice(0, 300)}`;
      else if (!run.ok) run.error = `${run.error ?? 'error'}; stderr: ${stderr.slice(0, 200)}`;
      resolve(run);
    });
  });
}

/**
 * DSH headless (`dsh headless --json`). Any model the configured DSH provider can run works here; the
 * harness itself contributes its own system prompt, so cross-runner token counts are not strictly comparable.
 */
export const dshRunner: AgentRunner = {
  id: 'dsh',
  description: 'DeepSeek Harness headless (`dsh headless --json`), one MCP server, built-in tools off',
  run: runDsh,
};
