import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { compile } from 'json-schema-to-typescript';
import type { GeneratedApi } from './types.ts';

type Schema = Parameters<typeof compile>[0];

/** Turn an MCP tool name into a valid JS identifier. */
export function toIdentifier(name: string): string {
  const id = name.replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[0-9]/.test(id) ? `_${id}` : id;
}

/** Names that already exist on every object: a tool called `constructor` or `__proto__` must not shadow them. */
const RESERVED = new Set(Object.getOwnPropertyNames(Object.prototype));

/**
 * Give every tool a distinct, safe identifier. `read-file` and `read_file` both sanitise to `read_file`; the second
 * becomes `read_file_2` instead of silently replacing the first, and reserved or double-underscore names are prefixed.
 * Returns a lookup from upstream tool name to identifier.
 */
export function assignIdentifiers(toolNames: readonly string[]): (name: string) => string {
  const byName = new Map<string, string>();
  const used = new Set<string>();
  for (const name of toolNames) {
    if (byName.has(name)) continue;
    let base = toIdentifier(name);
    if (RESERVED.has(base) || base.startsWith('__')) base = `tool_${base.replace(/^_+/, '')}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    byName.set(name, id);
  }
  return (name) => byName.get(name) ?? toIdentifier(name);
}

function pascal(name: string): string {
  return toIdentifier(name)
    .split('_')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

async function compileSchema(raw: object, title: string): Promise<string> {
  const schema = structuredClone(raw) as Record<string, unknown>;
  delete schema['$schema'];
  schema['title'] = title;
  const out = await compile(schema as Schema, title, {
    bannerComment: '',
    additionalProperties: false,
    format: false,
  });
  return out.trim();
}

/** Generate a TypeScript declaration for `namespace` from MCP tool definitions. */
export async function generateApi(
  tools: readonly Tool[],
  namespace = 'codemode',
  idOf: (name: string) => string = assignIdentifiers(tools.map((t) => t.name)),
): Promise<GeneratedApi> {
  const decls: string[] = [];
  const members: string[] = [];
  // No prototype, so an odd tool name can never reach Object.prototype.
  const names: Record<string, string> = Object.create(null) as Record<string, string>;
  const perTool: Record<string, string> = Object.create(null) as Record<string, string>;

  for (const tool of tools) {
    const id = idOf(tool.name);
    names[id] = tool.name;
    const base = pascal(tool.name);
    const declStart = decls.length;

    const inputType = `${base}Input`;
    try {
      decls.push(await compileSchema(tool.inputSchema, inputType));
    } catch {
      decls.push(`type ${inputType} = Record<string, unknown>;`);
    }

    let outputType = 'unknown';
    if (tool.outputSchema) {
      try {
        decls.push(await compileSchema(tool.outputSchema, `${base}Output`));
        outputType = `${base}Output`;
      } catch {
        /* fall back to unknown */
      }
    }

    const doc = (tool.description ?? '').replace(/\*\//g, '*\\/').trim().split('\n').join('\n   * ');
    const member = `  /** ${doc} */\n  ${id}(input: ${inputType}): Promise<${outputType}>;`;
    members.push(member);
    perTool[id] = `${decls.slice(declStart).join('\n\n')}\n\n${member}`;
  }

  const dts = `${decls.join('\n\n')}\n\ndeclare const ${namespace}: {\n${members.join('\n')}\n};\n`;
  return { dts, names, perTool };
}

