// Usage: npm run mcp:usage [-- --root <folder of Claude Code transcripts>] [--out <markdown file>] [--min-calls 1]
//
// Reads your own Claude Code session transcripts (default: ~/.claude/projects) and reports which MCP tools you actually
// use, how large their results are, and where several calls in a row went to the same service: the patterns where a
// codemode wrapper saves tokens. It records AGGREGATES ONLY: tool names, counts and sizes. It never copies arguments,
// results, prompts, file paths or project names into the report.
import { createReadStream, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const repo = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({
  options: {
    root: { type: 'string', default: join(homedir(), '.claude', 'projects') },
    out: { type: 'string', default: join(repo, 'docs', 'mcp-usage.md') },
    'min-calls': { type: 'string', default: '1' },
  },
});

/** Servers that belong to the Claude app itself (task list, panes, sessions, terminal, charts): not a codemode target. */
const HARNESS = /^(ccd_|terminal$|visualize$|scheduled-tasks$|mcp-registry$|Claude_Browser$|computer-use$|ide$)/;
// computer-use is excluded too: it is one UI step per call (click, screenshot) and each step needs the model to look at the screen.

/**
 * Some MCP servers appear under an opaque id, so the service is inferred from distinctive tool names. Order matters:
 * the first match wins. Anything unmatched is reported under its server name.
 */
const BY_TOOL: [RegExp, string][] = [
  [/^(notion-|API-(get|post|patch|retrieve|create|update|delete|query|list|move))/, 'notion'],
  [/^(save_issue|list_issues|get_issue|save_project|list_projects|list_cycles|save_comment|list_teams|get_team|list_users)$/, 'linear'],
  [/^(list_calendars|list_events|create_event|update_event|delete_event|get_event|respond_to_event|suggest_time|search_events)$/, 'calendar'],
  [/^(resolve-library-id|query-docs)$/, 'context7'],
  [/^(get_design_context|get_metadata|get_screenshot|get_variable_defs|add_code_connect_map|get_code_connect_map|create_design_system_rules)$/, 'figma'],
  [/^(browser_|playwright_)/, 'playwright'],
  [/^(get_scene_info|execute_blender_code|get_viewport_screenshot|search_assets|import_asset|get_addon_status)$/, 'blender'],
  [/^(PowerShell|FileSystem|Snapshot|Screenshot|Registry|Process|Clipboard|Notification|WaitFor|DisplayInventory|MultiEdit|MultiSelect)$/, 'windows'],
  [/^(read_text_file|read_multiple_files|list_directory|directory_tree|search_files|get_file_info|write_file|edit_file|move_file|create_directory|list_allowed_directories)$/, 'filesystem'],
  [/^(navigate|tabs_context_mcp|tabs_create_mcp|read_page|find|form_input|get_page_text|javascript_tool|read_console_messages|read_network_requests|computer|resize_window|gif_creator|file_upload|upload_image|switch_browser|select_browser|list_connected_browsers)$/, 'chrome-extension'],
  [/^(list_scheduled|create_scheduled|update_scheduled|delete_scheduled|run_scheduled)/, 'scheduled-tasks'],
];

interface Call {
  server: string;
  tool: string;
  service: string;
  chars: number;
}

const services = new Set(
  readdirSync(join(repo, 'services'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.slice(0, -3)),
);

function split(name: string): { server: string; tool: string } | undefined {
  if (!name.startsWith('mcp__')) return undefined;
  const rest = name.slice(5);
  const i = rest.indexOf('__');
  return i < 0 ? undefined : { server: rest.slice(0, i), tool: rest.slice(i + 2) };
}

function serviceOf(server: string, tool: string): string {
  for (const [re, svc] of BY_TOOL) if (re.test(tool)) return svc;
  return server.replace(/^claude_ai_/i, '').toLowerCase();
}

function sizeOf(content: unknown): number {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    let n = 0;
    for (const c of content as { type?: string; text?: string; source?: { data?: string } }[]) {
      if (c.type === 'text') n += c.text?.length ?? 0;
      else if (c.type === 'image') n += c.source?.data?.length ?? 0;
    }
    return n;
  }
  return 0;
}

const allFiles: string[] = [];
function walk(dir: string): void {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.jsonl')) allFiles.push(p);
  }
}
if (!existsSync(values.root)) {
  console.error(`No transcripts at ${values.root}`);
  process.exit(1);
}
walk(values.root);

const calls: Call[] = [];
/** Calls to servers that are not codemode targets, counted by server name so the report can say how many it left out. */
const excluded = new Map<string, number>();
/** Per transcript, the ordered list of tool calls by service (non-MCP tools are `-`), for chain detection. */
const sequences: string[][] = [];
let firstTs = Infinity;
let lastTs = 0;

for (const file of allFiles) {
  const pending = new Map<string, Call>();
  const seq: string[] = [];
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('"tool_use"') && !line.includes('"tool_result"')) continue;
    let ev: { timestamp?: string; type?: string; isSidechain?: boolean; message?: { content?: unknown } };
    try {
      ev = JSON.parse(line) as typeof ev;
    } catch {
      continue;
    }
    if (ev.timestamp) {
      const t = Date.parse(ev.timestamp);
      if (!Number.isNaN(t)) {
        firstTs = Math.min(firstTs, t);
        lastTs = Math.max(lastTs, t);
      }
    }
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as { type?: string; id?: string; name?: string; tool_use_id?: string; content?: unknown }[]) {
      if (block.type === 'tool_use' && block.id && block.name) {
        const parts = split(block.name);
        if (!parts) {
          seq.push('-');
          continue;
        }
        if (HARNESS.test(parts.server)) {
          excluded.set(parts.server, (excluded.get(parts.server) ?? 0) + 1);
          seq.push('-');
          continue;
        }
        const call: Call = { ...parts, service: serviceOf(parts.server, parts.tool), chars: 0 };
        pending.set(block.id, call);
        calls.push(call);
        seq.push(call.service);
      } else if (block.type === 'tool_result' && block.tool_use_id) {
        const call = pending.get(block.tool_use_id);
        if (call) call.chars = sizeOf(block.content);
      }
    }
  }
  sequences.push(seq);
}

// ---- chains: runs of 3+ consecutive calls to the same service, no other tool in between -----------------------------
interface Chain {
  service: string;
  length: number;
}
const chains: Chain[] = [];
for (const seq of sequences) {
  let i = 0;
  while (i < seq.length) {
    const s = seq[i] as string;
    let j = i;
    while (j < seq.length && seq[j] === s) j++;
    if (s !== '-' && j - i >= 3) chains.push({ service: s, length: j - i });
    i = j;
  }
}

// ---- aggregate ------------------------------------------------------------------------------------------------------------
const minCalls = Number(values['min-calls']);
const pctl = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};
const tokens = (chars: number): string => Math.round(chars / 4).toLocaleString('en-US');
const BIG = 8000;

interface Svc {
  calls: Call[];
  tools: Map<string, Call[]>;
  chainCalls: number;
  chainCount: number;
  longest: number;
}
const bySvc = new Map<string, Svc>();
for (const c of calls) {
  const s: Svc = bySvc.get(c.service) ?? { calls: [], tools: new Map<string, Call[]>(), chainCalls: 0, chainCount: 0, longest: 0 };
  s.calls.push(c);
  s.tools.set(c.tool, [...(s.tools.get(c.tool) ?? []), c]);
  bySvc.set(c.service, s);
}
for (const ch of chains) {
  const s = bySvc.get(ch.service);
  if (!s) continue;
  s.chainCalls += ch.length;
  s.chainCount++;
  s.longest = Math.max(s.longest, ch.length);
}

const rows = [...bySvc.entries()]
  .filter(([, s]) => s.calls.length >= minCalls)
  .map(([name, s]) => {
    const chars = s.calls.reduce((n, c) => n + c.chars, 0);
    const big = s.calls.filter((c) => c.chars >= BIG).length;
    return { name, s, chars, big };
  })
  .sort((a, b) => b.chars - a.chars);

const days = lastTs > 0 ? Math.max(1, Math.round((lastTs - firstTs) / 86_400_000)) : 0;
const out: string[] = [
  '# MCP usage in your own sessions',
  '',
  `Generated by \`npm run mcp:usage\` from ${allFiles.length} Claude Code transcripts spanning about ${days} day(s). **Aggregates only**: tool names, counts and result sizes. No arguments, results, prompts, paths or project names are copied here. Calls to the Claude app's own servers (task list, panes, sessions, terminal, charts) are excluded: they are not codemode targets.`,
  '',
  `${calls.length} MCP calls across ${bySvc.size} services. Result size is the text a tool returned into the model's context (tokens estimated as characters / 4). A **big result** is ${BIG.toLocaleString('en-US')} characters or more. A **chain** is 3 or more calls in a row to the same service with no other tool between them.`,
  '',
  '## By service',
  '',
  '| Service | Calls | Tools used | Result tokens (≈) | Big results | In chains | Longest chain | Codemode service |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map(({ name, s, chars, big }) => {
    const has = services.has(name) ? `yes (\`services/${name}.ts\`)` : 'no';
    const inChains = s.calls.length > 0 ? `${s.chainCalls} (${Math.round((s.chainCalls / s.calls.length) * 100)}%)` : '0';
    return `| ${name} | ${s.calls.length} | ${s.tools.size} | ${tokens(chars)} | ${big} | ${inChains} | ${s.longest || '-'} | ${has} |`;
  }),
  '',
  '## Heaviest tools (by total result size)',
  '',
  '| Service | Tool | Calls | Result tokens (≈) | Median | 95th percentile | Largest |',
  '|---|---|---|---|---|---|---|',
];
const toolRows: { svc: string; tool: string; list: Call[]; total: number }[] = [];
for (const { name, s } of rows) for (const [tool, list] of s.tools) toolRows.push({ svc: name, tool, list, total: list.reduce((n, c) => n + c.chars, 0) });
toolRows.sort((a, b) => b.total - a.total);
for (const r of toolRows.slice(0, 20)) {
  const sizes = r.list.map((c) => c.chars);
  out.push(`| ${r.svc} | ${r.tool} | ${r.list.length} | ${tokens(r.total)} | ${tokens(pctl(sizes, 0.5))} | ${tokens(pctl(sizes, 0.95))} | ${tokens(Math.max(...sizes))} |`);
}
if (rows.length === 0) out.push('', '_No calls to a wrappable MCP service were found in these transcripts._');
if (excluded.size > 0) {
  out.push('', '## Not codemode targets (calls counted, then excluded)', '', '| Server | Calls | Why excluded |', '|---|---|---|');
  for (const [name, n] of [...excluded.entries()].sort((a, b) => b[1] - a[1])) {
    out.push(`| ${name} | ${n} | ${name === 'computer-use' ? 'one UI step per call; every step needs the model to look at the screen' : 'part of the Claude app itself'} |`);
  }
}
out.push('', '## Reading this', '', '- **Big results** and **chains** are where a codemode wrapper helps: a script reads the large result and returns only what you need, and a chain of calls becomes one script.');
out.push('- A service with many calls but small results and no chains (for example a lookup tool) gains little: the saving there is only the smaller tool definition.');
out.push('- Servers with an opaque id are matched to a service by their tool names (`BY_TOOL` in `scripts/mcp-usage.ts`); an unmatched server is listed under its own name.', '');
writeFileSync(values.out, `${out.join('\n')}\n`);
console.log(`Wrote ${values.out}: ${calls.length} MCP calls, ${bySvc.size} services, ${chains.length} chains`);
