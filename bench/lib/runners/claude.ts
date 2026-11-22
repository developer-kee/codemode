import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { AgentRun, AgentRunner, RunnerRunOptions, TurnUsage } from './agent.ts';
import { mcpLaunch } from './mcp.ts';

/** Run one prompt through Claude Code headless and normalise its stream-json result. */
function runClaude(opts: RunnerRunOptions): Promise<AgentRun> {
  mkdirSync(opts.workDir, { recursive: true });
  const launch = mcpLaunch(opts.service, opts.variant, opts.path);
  const mcpFile = `${opts.workDir}mcp-${opts.service.id}-${opts.variant.id}-${opts.path}.json`;
  const sysFile = `${opts.workDir}system-${opts.service.id}-${opts.variant.id}.txt`;
  writeFileSync(
    mcpFile,
    JSON.stringify({
      mcpServers: { [launch.server]: { command: launch.command, args: launch.args, ...(launch.env ? { env: launch.env } : {}) } },
    }),
  );
  writeFileSync(sysFile, opts.variant.systemPrompt);

  const q = (s: string): string => `"${s}"`;
  const claude = process.platform === 'win32' ? 'claude.cmd' : 'claude';
  const cmdline = [
    `${claude} -p`,
    '--output-format stream-json --verbose',
    `--model ${opts.model}`,
    `--strict-mcp-config --mcp-config ${q(mcpFile)}`,
    '--tools ""',
    `--allowedTools ${q(`mcp__${launch.server}`)}`,
    '--disable-slash-commands --setting-sources "" --no-session-persistence --no-chrome',
    `--system-prompt-file ${q(sysFile)}`,
    `--max-budget-usd ${opts.budgetUsd}`,
  ].join(' ');

  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmdline, { shell: true, cwd: opts.workDir, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      stderr += '\n[harness] timeout, killing';
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      else child.kill('SIGKILL');
    }, opts.timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    child.stdin.end(opts.prompt);
    child.on('close', () => {
      clearTimeout(timer);
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
        costUsd: 0,
        durationMs: Date.now() - started,
      };
      let sawFirst = false;
      for (const line of stdout.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (ev['type'] === 'system' && ev['subtype'] === 'init') {
          run.availableTools = ((ev['tools'] as unknown[]) ?? []).map(String);
        } else if (ev['type'] === 'assistant') {
          const msg = (ev['message'] ?? {}) as Record<string, unknown>;
          for (const block of (msg['content'] as Record<string, unknown>[] | undefined) ?? []) {
            if (block['type'] === 'tool_use') {
              run.toolCalls++;
              run.toolNames.push(String(block['name']));
            }
          }
          if (!sawFirst) {
            sawFirst = true;
            const u = usageOf(msg['usage']);
            run.firstTurnContext = u.input + u.cacheWrite + u.cacheRead;
          }
        } else if (ev['type'] === 'result') {
          run.usage = usageOf(ev['usage']);
          run.costUsd = num(ev['total_cost_usd']);
          run.turns = num(ev['num_turns']);
          run.apiMs = num(ev['duration_api_ms']);
          run.answer = typeof ev['result'] === 'string' ? ev['result'] : '';
          run.ok = ev['is_error'] !== true;
          if (!run.ok) run.error = String(ev['subtype'] ?? 'error');
        }
      }
      if (run.turns === 0 && !run.error) run.error = `no result event; stderr: ${stderr.slice(0, 300)}`;
      resolve(run);
    });
  });
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const usageOf = (u: unknown): TurnUsage => {
  const o = (u ?? {}) as Record<string, unknown>;
  return {
    input: num(o['input_tokens']),
    cacheWrite: num(o['cache_creation_input_tokens']),
    cacheRead: num(o['cache_read_input_tokens']),
    output: num(o['output_tokens']),
  };
};

/** Claude Code (`claude -p`): the runner every pre-existing record was produced with. */
export const claudeRunner: AgentRunner = {
  id: 'claude',
  description: 'Claude Code headless (`claude -p`), one MCP server, built-in tools off',
  run: runClaude,
};
