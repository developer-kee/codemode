import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolAccess } from './types.ts';

/**
 * Keep only the tools the config allows. `deny` wins over `allow`; with `allow` set, only listed tools stay;
 * `readOnly` keeps only tools annotated `readOnlyHint: true` (no annotations means excluded).
 * Names are the upstream MCP tool names.
 */
export function filterTools(tools: readonly Tool[], access: ToolAccess | undefined): Tool[] {
  if (!access) return [...tools];
  const allow = access.allow ? new Set(access.allow) : undefined;
  const deny = new Set(access.deny ?? []);
  return tools.filter((t) => {
    if (deny.has(t.name)) return false;
    if (allow && !allow.has(t.name)) return false;
    if (access.readOnly === true && t.annotations?.readOnlyHint !== true) return false;
    return true;
  });
}
