// Upstream transport: connect to an MCP server and turn its results into plain code values.
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { FileOAuthProvider } from './oauth.ts';
import type { Upstream } from './types.ts';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Credentials and tool results travel over this connection, so plain http is only acceptable on this machine. */
export function assertSecureUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.has(u.hostname))) {
    throw new Error(`Refusing to connect to ${u.origin}: use https, or http only for localhost.`);
  }
  return u;
}

/** Addresses a remote upstream (or an OAuth endpoint it points to) must not resolve to: this machine, the local network, cloud metadata. */
const PRIVATE = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) {
  PRIVATE.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) PRIVATE.addSubnet(net, bits, 'ipv6');

/** True for an address in a private, loopback, link-local, metadata or otherwise non-public range (IPv4-mapped IPv6 included). */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  const ip = mapped?.[1] ?? address;
  const family = isIP(ip);
  return family === 0 ? true : PRIVATE.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * Refuse a remote host that resolves to a private or metadata address, so a URL cannot be used to reach the local
 * network (SSRF). A host written as localhost, 127.0.0.1 or [::1] is allowed: that is an explicit choice to talk to this
 * machine. Limit: the name is resolved here and again by the fetch that follows, so a DNS answer that changes in between
 * (rebinding) is not caught.
 */
export async function assertPublicHost(url: URL): Promise<void> {
  if (LOOPBACK.has(url.hostname)) return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  const bad = addresses.find((a) => isPrivateAddress(a.address));
  if (bad) throw new Error(`Refusing to connect to ${url.hostname}: it resolves to a private or reserved address (${bad.address}).`);
}

/** A `fetch` that checks every request's host first: the MCP endpoint, and any OAuth endpoint it points to. */
export const guardedFetch: typeof fetch = async (input, init) => {
  const raw = input instanceof Request ? input.url : String(input);
  await assertPublicHost(new URL(raw));
  return fetch(input, init);
};

/**
 * The environment an upstream process gets: the SDK's small safe default (PATH, home and temp folders), the
 * variables the service names in `passEnv`, then `env`. The wrapper's other variables, which may hold unrelated
 * secrets, never reach the upstream.
 */
export function upstreamEnv(upstream: { env?: Record<string, string>; passEnv?: string[] }): Record<string, string> {
  const passed: Record<string, string> = {};
  for (const name of upstream.passEnv ?? []) {
    const value = process.env[name];
    if (value !== undefined) passed[name] = value;
  }
  return { ...getDefaultEnvironment(), ...passed, ...upstream.env };
}

/** Connect to the upstream MCP server (stdio command or streamable-HTTP url). */
export async function connectUpstream(upstream: Upstream): Promise<Client> {
  const client = new Client({ name: 'codemode', version: '0.1.0' });
  const transport =
    'url' in upstream
      ? new StreamableHTTPClientTransport(assertSecureUrl(upstream.url), {
          requestInit: { headers: upstream.headers ?? {} },
          fetch: guardedFetch,
          ...(upstream.oauth
            ? { authProvider: new FileOAuthProvider({ service: upstream.oauth.service, serverUrl: assertSecureUrl(upstream.url).href }) }
            : {}),
        })
      : new StdioClientTransport({
          command: upstream.command,
          args: upstream.args ?? [],
          env: upstreamEnv(upstream),
          stderr: 'inherit',
        });
  await client.connect(transport);
  return client;
}

/** Size of a tool result in characters: text, binary data (base64) and structured content. */
export function resultChars(res: CallToolResult): number {
  let n = res.structuredContent === undefined ? 0 : JSON.stringify(res.structuredContent).length;
  for (const c of res.content) n += c.type === 'text' ? c.text.length : 'data' in c ? String(c.data).length : 0;
  return n;
}

/** Collapse an MCP CallToolResult into something pleasant to use from code. */
export function unwrapResult(res: CallToolResult): unknown {
  const content = res.content;
  if (res.isError) {
    const msg = content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
    throw new Error(msg || 'tool error');
  }
  if (res.structuredContent !== undefined) return res.structuredContent;
  const texts: string[] = [];
  for (const c of content) {
    if (c.type !== 'text') return content; // images etc. pass through untouched
    texts.push(c.text);
  }
  if (texts.length === 0) return content;
  const text = texts.join('\n');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Every tool the upstream offers, following pagination. */
export async function listAllTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor === undefined ? {} : { cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return tools;
}
