// Tool-definition lock: detect an upstream whose tools changed after you reviewed them (a "rug pull").
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/** Hashes of each part of one tool definition, so a change can say what changed. */
export interface LockEntry {
  description: string;
  inputSchema: string;
  outputSchema: string;
  annotations: string;
}

export interface LockFile {
  version: 1;
  tools: Record<string, LockEntry>;
}

export interface LockDiff {
  /** Tools the lock has never seen: a new tool is as suspect as a changed one. */
  added: string[];
  changed: { tool: string; parts: string[] }[];
  /** In the lock but not offered now. Informational: a restricted variant or a dropped tool. */
  removed: string[];
}

/** JSON with sorted keys, so equal values always hash equally. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const sha256 = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');

function entryOf(tool: Tool): LockEntry {
  return {
    description: sha256(tool.description ?? ''),
    inputSchema: sha256(tool.inputSchema),
    outputSchema: sha256(tool.outputSchema ?? null),
    annotations: sha256(tool.annotations ?? null),
  };
}

/** The lock for exactly these tools. */
export function lockOf(tools: readonly Tool[]): LockFile {
  const entries = [...tools].sort((a, b) => a.name.localeCompare(b.name)).map((t) => [t.name, entryOf(t)] as const);
  return { version: 1, tools: Object.fromEntries(entries) };
}

export function diffLock(lock: LockFile, tools: readonly Tool[]): LockDiff {
  const now = lockOf(tools);
  const added = Object.keys(now.tools).filter((n) => !Object.hasOwn(lock.tools, n));
  const removed = Object.keys(lock.tools).filter((n) => !Object.hasOwn(now.tools, n));
  const changed: LockDiff['changed'] = [];
  for (const [name, entry] of Object.entries(now.tools)) {
    const old = Object.hasOwn(lock.tools, name) ? lock.tools[name] : undefined;
    if (!old) continue;
    const parts = (Object.keys(entry) as (keyof LockEntry)[]).filter((k) => entry[k] !== old[k]);
    if (parts.length > 0) changed.push({ tool: name, parts });
  }
  return { added, changed, removed };
}

/** True when something was added or altered. Removed tools alone do not block. */
export const isBlocking = (d: LockDiff): boolean => d.added.length > 0 || d.changed.length > 0;

export function describeDiff(d: LockDiff): string {
  const lines: string[] = [];
  for (const c of d.changed) lines.push(`  changed: ${c.tool} (${c.parts.join(', ')})`);
  for (const a of d.added) lines.push(`  added:   ${a}`);
  for (const r of d.removed) lines.push(`  removed: ${r}`);
  return lines.join('\n');
}

export function readLock(path: string): LockFile | undefined {
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LockFile>;
  if (parsed.version !== 1 || typeof parsed.tools !== 'object' || parsed.tools === null) {
    throw new Error(`${path} is not a codemode tool lock (expected version 1)`);
  }
  return { version: 1, tools: Object.assign(Object.create(null) as Record<string, LockEntry>, parsed.tools) };
}

export function writeLock(path: string, lock: LockFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
}

export type LockMode = 'enforce' | 'update' | 'warn' | 'off';

export interface LockOptions {
  path: string;
  mode: LockMode;
  /** Refuse to start when no lock file exists (default: warn and continue). */
  require?: boolean;
}

/**
 * Check the upstream's tools against the lock, or write the lock. Throws when the definitions changed and the
 * mode is `enforce`. `update` should be run only after reading what changed.
 */
export function applyLock(serviceName: string, tools: readonly Tool[], options: LockOptions, say: (line: string) => void = console.error): void {
  if (options.mode === 'off') return;
  if (options.mode === 'update') {
    writeLock(options.path, lockOf(tools));
    say(`[codemode] ${serviceName}: wrote the tool lock for ${tools.length} tools to ${options.path}`);
    return;
  }
  const lock = readLock(options.path);
  if (!lock) {
    const msg = `${serviceName}: no tool lock at ${options.path}. Run \`node src/cli.ts ${serviceName} --update-lock\` after reviewing the tools.`;
    if (options.require) throw new Error(msg);
    say(`[codemode] warning: ${msg}`);
    return;
  }
  const diff = diffLock(lock, tools);
  if (!isBlocking(diff)) {
    if (diff.removed.length > 0) say(`[codemode] ${serviceName}: ${diff.removed.length} locked tools are not offered now: ${diff.removed.join(', ')}`);
    return;
  }
  const detail = describeDiff(diff);
  if (options.mode === 'warn') {
    say(`[codemode] warning: ${serviceName}: tool definitions differ from ${options.path}\n${detail}`);
    return;
  }
  throw new Error(
    `${serviceName}: the upstream's tool definitions changed since the lock was written (${options.path}):\n${detail}\n` +
      `Review the change. If it is expected, accept it with \`node src/cli.ts ${serviceName} --update-lock\`.`,
  );
}
