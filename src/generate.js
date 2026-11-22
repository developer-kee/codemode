import { compile } from 'json-schema-to-typescript';

/** Turn an MCP tool name into a valid JS identifier. */
export function toIdentifier(name) {
  let id = name.replace(/[^A-Za-z0-9_$]/g, '_');
  if (/^[0-9]/.test(id)) id = '_' + id;
  return id;
}

function pascal(name) {
  return toIdentifier(name)
    .split('_')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('');
}

/**
 * Generate a TypeScript declaration for `namespace` from MCP tool definitions.
 * Returns { dts, names } where names maps identifier -> original MCP tool name.
 */
export async function generateApi(tools, namespace = 'codemode') {
  const decls = [];
  const members = [];
  const names = {};

  for (const tool of tools) {
    const id = toIdentifier(tool.name);
    names[id] = tool.name;
    const base = pascal(tool.name);

    const schema = structuredClone(tool.inputSchema ?? { type: 'object' });
    delete schema.$schema;
    schema.title = `${base}Input`;
    let inputType = `${base}Input`;
    try {
      decls.push(
        (await compile(schema, `${base}Input`, {
          bannerComment: '',
          additionalProperties: false,
          format: false,
          strictIndexSignatures: false,
        })).trim(),
      );
    } catch {
      decls.push(`type ${inputType} = Record<string, unknown>;`);
    }

    let outputType = 'unknown';
    if (tool.outputSchema) {
      try {
        const out = structuredClone(tool.outputSchema);
        delete out.$schema;
        out.title = `${base}Output`;
        decls.push(
          (await compile(out, `${base}Output`, {
            bannerComment: '',
            additionalProperties: false,
            format: false,
          })).trim(),
        );
        outputType = `${base}Output`;
      } catch {
        /* fall back to unknown */
      }
    }

    const doc = (tool.description ?? '').replace(/\*\//g, '*\\/').trim();
    members.push(
      `  /** ${doc.split('\n').join('\n   * ')} */\n  ${id}(input: ${inputType}): Promise<${outputType}>;`,
    );
  }

  const dts = `${decls.join('\n\n')}\n\ndeclare const ${namespace}: {\n${members.join('\n')}\n};\n`;
  return { dts, names };
}
