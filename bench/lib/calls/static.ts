// Static cost: what each tool's definition costs the model on every turn.
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { generateApi, toIdentifier } from '../../../src/generate.ts';
import { compactIndex, describeExecuteCode, GET_API_DESCRIPTION, headerBudget } from '../../../src/describe.ts';

/** Rough token estimate. Real tokenisation varies with content; use for relative comparison. */
export const estimateTokens = (chars: number): number => Math.round(chars / 4);

export interface StaticRow {
  tool: string;
  covered: boolean;
  directChars: number;
  /** This tool's line in the execute_code description (always sent). */
  codemodeChars: number;
  /** The full declaration get_api returns for it (sent only if the model asks). */
  onDemandChars: number;
}

export interface StaticCosts {
  rows: StaticRow[];
  directTotalChars: number;
  /** execute_code description plus both tool definitions: what is sent every turn. */
  codemodeTotalChars: number;
  /** execute_code description length; Claude Code cuts descriptions at about 2,048 characters. */
  descriptionChars: number;
  /** How detailed the index in the description is (1 richest, 4 names only, truncated). */
  indexLevel: number;
}

export const CLAUDE_CODE_DESCRIPTION_CAP = 2048;

export async function staticCosts(tools: readonly Tool[], covered: ReadonlySet<string>): Promise<StaticCosts> {
  const { perTool } = await generateApi(tools);
  const index = compactIndex(tools, headerBudget());
  const description = describeExecuteCode(index);
  const rows = tools.map((t): StaticRow => {
    const id = toIdentifier(t.name);
    return {
      tool: t.name,
      covered: covered.has(t.name),
      // What an MCP client sends the model per tool: name, description, input schema.
      directChars: JSON.stringify({ name: t.name, description: t.description ?? '', input_schema: t.inputSchema }).length,
      codemodeChars: (index.lines[id] ?? '').length,
      onDemandChars: (perTool[id] ?? '').length,
    };
  });
  const defs =
    JSON.stringify({ name: 'execute_code', description, input_schema: { type: 'object', properties: { code: { type: 'string' } } } }).length +
    JSON.stringify({ name: 'get_api', description: GET_API_DESCRIPTION, input_schema: { type: 'object', properties: { names: { type: 'array' } } } }).length;
  return {
    rows,
    directTotalChars: rows.reduce((n, r) => n + r.directChars, 0),
    codemodeTotalChars: defs,
    descriptionChars: description.length,
    indexLevel: index.level,
  };
}
