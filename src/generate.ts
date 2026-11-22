import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { compile } from 'json-schema-to-typescript';
import type { GeneratedApi } from './types.ts';

type Schema = Parameters<typeof compile>[0];

/** Turn an MCP tool name into a valid JS identifier. */
export function toIdentifier(name: string): string {
  const id = name.replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[0-9]/.test(id) ? `_${id}` : id;
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
): Promise<GeneratedApi> {
  const decls: string[] = [];
  const members: string[] = [];
  const names: Record<string, string> = {};

  for (const tool of tools) {
    const id = toIdentifier(tool.name);
    names[id] = tool.name;
    const base = pascal(tool.name);

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
    members.push(`  /** ${doc} */\n  ${id}(input: ${inputType}): Promise<${outputType}>;`);
  }

  const dts = `${decls.join('\n\n')}\n\ndeclare const ${namespace}: {\n${members.join('\n')}\n};\n`;
  return { dts, names };
}
