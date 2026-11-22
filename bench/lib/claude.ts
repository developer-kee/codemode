import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BenchService, BenchVariant } from './types.ts';

export type PathId = 'direct' | 'codemode';

const root = fileURLToPath(new URL('../../', import.meta.url));
/** Empty working directory so no CLAUDE.md or project settings leak into a run. */
const workDir = fileURLToPath(new URL('../work/', import.meta.url));

/** Same upstream for both paths; only the wrapper differs. */
function mcpConfig(service: BenchService, variant: BenchVariant, path: PathId): { server: string; json: object } {
  if (path === 'direct') {
    const d = variant.direct;
    return {
      server: d.server,
      json: { mcpServers: { [d.server]: { command: d.command, args: d.args, ...(d.env ? { env: d.env } : {}) } } },
    };
  }
  const server = `${service.id}-cm`;
  return {
    server,
    json: {
      mcpServers: {
        [server]: {
          command: process.execPath,
          args: [`${root}src/cli.ts`, service.id],
          ...(variant.codemodeEnv ? { env: variant.codemodeEnv } : {}),
        },
      },
    },
  };
}

export interface TurnUsage {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export interface ClaudeRun {
  path: PathId;
  ok: boolean;
  error?: string;
  answer: string;
  turns: number;
  toolCalls: number;
  toolNames: string[];
  /** Tools visible to the model at start-up (to confirm built-ins are off). */
  availableTools: string[];
  /** Context size on the first request: system prompt + tool definitions + task. */
  firstTurnContext: number;
  usage: TurnUsage;
  costUsd: number;
  durationMs: number;
  /** Time spent waiting on the model API, as reported by the CLI (absent in older records). */
  apiMs?: number;
}

type Json = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const usageOf = (u: unknown): TurnUsage => {
  const o = (u ?? {}) as Json;
  return {
    input: num(o['input_tokens']),
    cacheWrite: num(o['cache_creation_input_tokens']),
    cacheRead: num(o['cache_read_input_tokens']),
    output: num(o['output_tokens']),
  };
};

export function runClaude(opts: {
  service: BenchService;
  variant: BenchVariant;
  path: PathId;
  model: string;
  prompt: string;
  budgetUsd: number;
  timeoutMs: number;
}): Promise<ClaudeRun> {
  mkdirSync(workDir, { recursive: true });
  const { server, json } = mcpConfig(opts.service, opts.variant, opts.path);
  const mcpFile = `${workDir}mcp-${opts.service.id}-${opts.variant.id}-${opts.path}.json`;
  const sysFile = `${workDir}system-${opts.service.id}-${opts.variant.id}.txt`;
  writeFileSync(mcpFile, JSON.stringify(json));
  writeFileSync(sysFile, opts.variant.systemPrompt);

  const q = (s: string): string => `"${s}"`;
  const cmdline = [
    'claude.cmd -p',
    '--output-format stream-json --verbose',
    `--model ${opts.model}`,
    `--strict-mcp-config --mcp-config ${q(mcpFile)}`,
    '--tools ""',
    `--allowedTools ${q(`mcp__${server}`)}`,
    '--disable-slash-commands --setting-sources "" --no-session-persistence --no-chrome',
    `--system-prompt-file ${q(sysFile)}`,
    `--max-budget-usd ${opts.budgetUsd}`,
  ].join(' ');

  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmdline, { shell: true, cwd: workDir, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      stderr += '\n[harness] timeout, killing';
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    }, opts.timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    child.stdin.end(opts.prompt);
    child.on('close', () => {
      clearTimeout(timer);
      const run: ClaudeRun = {
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
        let ev: Json;
        try {
          ev = JSON.parse(line) as Json;
        } catch {
          continue;
        }
        if (ev['type'] === 'system' && ev['subtype'] === 'init') {
          run.availableTools = ((ev['tools'] as unknown[]) ?? []).map(String);
        } else if (ev['type'] === 'assistant') {
          const msg = (ev['message'] ?? {}) as Json;
          for (const block of (msg['content'] as Json[] | undefined) ?? []) {
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
