import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { assignIdentifiers } from './generate.ts';

/**
 * Claude Code cuts an MCP tool description at about 2,048 characters. Anything past that never reaches the model,
 * so the description must carry what the model needs to start (every function name and its parameters) and leave
 * the rest to `get_api`.
 */
export const DESCRIPTION_BUDGET = 1900;

type Obj = Record<string, unknown>;

function tsType(schema: unknown): string {
  if (schema === null || typeof schema !== 'object') return 'any';
  const s = schema as Obj;
  if (Array.isArray(s['enum'])) {
    const vals = (s['enum'] as unknown[]).map((v) => JSON.stringify(v));
    return vals.length > 6 ? `${vals.slice(0, 6).join('|')}|…` : vals.join('|');
  }
  const alt = (s['anyOf'] ?? s['oneOf']) as unknown[] | undefined;
  if (Array.isArray(alt)) {
    const parts = [...new Set(alt.map(tsType).filter((t) => t !== 'null'))];
    return parts.join('|') || 'any';
  }
  const t = s['type'];
  if (Array.isArray(t)) return t.filter((x) => x !== 'null').map((x) => tsType({ type: x })).join('|') || 'any';
  switch (t) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array': {
      const inner = tsType(s['items']);
      return inner.includes('|') ? `(${inner})[]` : `${inner}[]`;
    }
    case 'object':
      return 'object';
    default:
      return 'any';
  }
}

interface Param {
  name: string;
  required: boolean;
  type: string;
}

function paramsOf(tool: Tool): Param[] {
  const schema = tool.inputSchema as Obj;
  const props = (schema['properties'] ?? {}) as Record<string, unknown>;
  const required = new Set((schema['required'] as string[] | undefined) ?? []);
  return Object.entries(props).map(([name, p]) => ({ name, required: required.has(name), type: tsType(p) }));
}

function firstSentence(text: string | undefined, max: number): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  const cut = flat.split(/(?<=[.!?])\s/)[0] ?? '';
  return cut.length > max ? `${cut.slice(0, max - 1)}…` : cut;
}

const cap = (line: string, max: number): string => (line.length > max ? `${line.slice(0, max - 1)}…` : line);

/** One line per tool at the given level of detail (1 = types and summary, 2 = parameter names, 3 = name). */
function lineFor(tool: Tool, level: 1 | 2 | 3, id: string): string {
  if (level === 3) return id;
  const params = paramsOf(tool);
  if (level === 2) {
    return `${id}({ ${params.map((p) => `${p.name}${p.required ? '' : '?'}`).join(', ')} })`;
  }
  const sig = `${id}({ ${params.map((p) => `${p.name}${p.required ? '' : '?'}: ${p.type}`).join('; ')} })`;
  const summary = firstSentence(tool.description, 70);
  return cap(summary ? `${sig} // ${summary}` : sig, 230);
}

export interface CompactIndex {
  /** The lines to embed in the description. */
  text: string;
  /** 1 = types and summary, 2 = parameter names, 3 = names only, 4 = names truncated to fit. */
  level: 1 | 2 | 3 | 4;
  /** Identifier -> the line (or fragment) that stands for it in `text`. */
  lines: Record<string, string>;
}

/** The richest listing of every tool that fits in `budget` characters. */
export function compactIndex(
  tools: readonly Tool[],
  budget: number,
  idOf: (name: string) => string = assignIdentifiers(tools.map((t) => t.name)),
): CompactIndex {
  for (const level of [1, 2, 3] as const) {
    const lines = tools.map((t) => lineFor(t, level, idOf(t.name)));
    const text = level === 3 ? lines.join(', ') : lines.map((l) => `  ${l}`).join('\n');
    if (text.length <= budget) {
      return { text, level, lines: Object.fromEntries(tools.map((t, i) => [idOf(t.name), lines[i] ?? ''])) };
    }
  }
  // Very large catalogue: as many names as fit, then a pointer to `get_api`.
  const names = tools.map((t) => idOf(t.name));
  const kept: string[] = [];
  let used = 0;
  for (const n of names) {
    if (used + n.length + 2 > budget - 60) break;
    kept.push(n);
    used += n.length + 2;
  }
  const more = names.length - kept.length;
  return {
    text: `${kept.join(', ')}${more > 0 ? `, … and ${more} more (call get_api with no arguments to list them all)` : ''}`,
    level: 4,
    lines: Object.fromEntries(names.map((n) => [n, n])),
  };
}

const HEADER = [
  'Run TypeScript against the `codemode` API in ONE script: chain calls, loop, filter and aggregate; only console.log() output and the returned value come back.',
  'No network, filesystem or imports; top-level await works. Call `await codemode.<name>({ ... })`. `store.get/set/delete/keys` keeps JSON values between scripts.',
  'Unsure of a parameter or return shape? Call get_api first (one call, any number of names).',
].join('\n');

/** The `execute_code` description. Always stays within {@link DESCRIPTION_BUDGET}. */
export function describeExecuteCode(index: CompactIndex, instructions = ''): string {
  const extra = instructions ? `\n${instructions}` : '';
  return `${HEADER}${extra}\nAPI:\n${index.text}`;
}

export const GET_API_DESCRIPTION =
  'Return the full TypeScript declarations (parameter types, docs, return types) for codemode functions. Pass the names you plan to use; omit names to get every function.';

/** Pieces of a service's own text that count against the budget before the index. */
export function headerBudget(instructions = ''): number {
  return DESCRIPTION_BUDGET - HEADER.length - instructions.length - 8;
}
