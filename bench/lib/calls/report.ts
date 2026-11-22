// Markdown sections for the deterministic per-call benchmark.
import type { CallsData } from './data.ts';
import { CLAUDE_CODE_DESCRIPTION_CAP, estimateTokens } from './static.ts';
import { portablePaths } from '../portable.ts';

const ms = (n: number): string => (n < 10 ? n.toFixed(1) : String(Math.round(n)));
const signed = (n: number): string => (n < 0 ? '-' : '+') + ms(Math.abs(n));
const tok = (chars: number): string => estimateTokens(chars).toLocaleString('en-US');

/** Report sections for the deterministic per-call benchmark, ready to append to a service's RESULTS.md. */
export function buildCallsSections(serviceId: string, data: CallsData): string[] {
  const { costs, latency } = data;
  const out: string[] = [
    '## Per-tool-call benchmark (no model)',
    '',
    'One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool\'s **definition** costs the model on every turn, how long **one call** takes directly versus through codemode\'s sandbox, and (optionally) the tokens a model spends making that one call (the `calls` variant in `npm run bench`). Method and caveats: [../../README.md](../../README.md).',
    '',
    `Generated ${data.date}. ${data.toolCount} upstream tools, ${data.cases.length} cases over ${data.coveredTools} tools, ${data.iterations} timed iterations per case after one warm-up.`,
    `Reproduce: \`npm run bench:calls -- --service ${serviceId} --iters ${data.iterations}\`.`,
    '',
    '### Definition cost per tool',
    '',
    'What the model is sent for each tool on **every turn**. `Direct` is the tool\'s name, description and input schema as JSON. `Codemode, always sent` is that tool\'s line in the `execute_code` description (name, parameters, one-line summary). `On demand` is its full TypeScript declaration, which the model only receives if it calls `get_api`. Tokens are estimated as characters / 4: good for comparing rows with each other, not an exact count.',
    '',
    '| Tool | Direct (≈ tokens) | Codemode, always sent (≈) | Codemode, on demand via get_api (≈) | In per-call cases |',
    '|---|---|---|---|---|',
  ];
  for (const r of [...costs.rows].sort((a, b) => b.directChars - a.directChars)) {
    out.push(`| ${r.tool} | ${tok(r.directChars)} | ${tok(r.codemodeChars)} | ${tok(r.onDemandChars)} | ${r.covered ? 'yes' : 'no'} |`);
  }
  const fits = costs.descriptionChars <= CLAUDE_CODE_DESCRIPTION_CAP;
  const biggest = Math.max(...costs.rows.map((r) => r.directChars));
  out.push(
    `| **Total sent every turn** | **${tok(costs.directTotalChars)}** | **${tok(costs.codemodeTotalChars)}** (execute_code and get_api, with their fixed text) | | |`,
    '',
    `The biggest single definition is ${tok(biggest)} tokens, ${((biggest / costs.directTotalChars) * 100).toFixed(0)}% of the direct total.`,
    '',
    `**Truncation guard.** Claude Code cuts an MCP tool description at about ${CLAUDE_CODE_DESCRIPTION_CAP.toLocaleString('en-US')} characters; anything past that never reaches the model. The \`execute_code\` description here is **${costs.descriptionChars.toLocaleString('en-US')} characters** (${fits ? 'fits' : '**OVER THE CAP**'}), listing every function at detail level ${costs.indexLevel} (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../../README.md).`,
    '',
    '### Latency per call (no model)',
    '',
    'Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.',
    '',
    '| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const r of latency.rows) {
    out.push(
      `| ${r.id} | ${ms(r.direct.median)} | ${ms(r.direct.p95)} | ${ms(r.codemode.median)} | ${ms(r.codemode.p95)} ` +
        `| ${signed(r.codemode.median - r.direct.median)} ms | ${r.directChars.toLocaleString('en-US')} | ${r.codemodeChars.toLocaleString('en-US')} | ${r.errors.direct}/${r.errors.codemode} |`,
    );
  }
  out.push(
    '',
    `Sandbox-only cost (\`return 1\` through \`execute_code\`, no upstream call): median ${ms(latency.sandboxOnly.median)} ms, p95 ${ms(latency.sandboxOnly.p95)} ms. This is the floor of codemode's per-call overhead.`,
    '',
    '### Coverage',
    '',
    `Cases cover ${data.coveredTools} of ${data.toolCount} tools. The rest are skipped on purpose:`,
    '',
    '| Tool | Why it is not benchmarked |',
    '|---|---|',
    ...data.skipped.map((s) => `| ${s.tool} | ${s.reason} |`),
    '',
    '### Cases',
    '',
    '| Case | Arguments | Model prompt |',
    '|---|---|---|',
    ...data.cases.map((c) => `| ${c.id} | \`${portablePaths(JSON.stringify(c.args)).replace(/\|/g, '\\|')}\` | ${c.hasPrompt ? 'yes' : 'latency only'} |`),
    '',
  );
  return out;
}
