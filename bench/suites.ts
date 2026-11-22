import { blenderCalls } from './blender/cases.ts';
import type { CallSuite } from './lib/calls.ts';
import { windowsCalls } from './windows/cases.ts';

/** Per-tool-call suites: one data file of cases per MCP, no bespoke benchmark code. */
export const suites: CallSuite[] = [blenderCalls, windowsCalls];

export function getSuite(id: string): CallSuite | undefined {
  return suites.find((s) => s.id === id);
}
