import type { Capabilities, ToolAccess } from './types.ts';

/**
 * The "lethal trifecta": an agent that can read private data, takes in untrusted content and can communicate
 * outwards can be steered into leaking. If a service declares all three and nothing restricts it, say so.
 */
export function trifectaWarning(serviceName: string, caps: Capabilities | undefined, access: ToolAccess | undefined): string | undefined {
  if (!caps?.privateData || !caps.untrustedContent || !caps.externalComms) return undefined;
  const restricted = access !== undefined && (access.readOnly === true || access.allow !== undefined || (access.deny?.length ?? 0) > 0);
  if (restricted) return undefined;
  return (
    `${serviceName} gives the model private data, untrusted content and a way to communicate outwards at once, ` +
    'so injected text in what it reads could make it leak. Narrow it with `access` in the service file (for example ' +
    '`readOnly`, or `deny` for tools that write or send), or run with --read-only.'
  );
}
