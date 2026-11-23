import { existsSync } from 'node:fs';
import { callsVariant } from '../../lib/calls/index.ts';
import type { BenchService, BenchVariant } from '../../lib/types/index.ts';
import { solidcraftCalls } from './cases.ts';

const DEFAULT_CLI = 'C:\Program Files\SolidCraft\solidcraft-cli.exe';
const cli = process.env['SOLIDCRAFT_CLI'] ?? (existsSync(DEFAULT_CLI) ? DEFAULT_CLI : 'solidcraft-cli');

const base: BenchVariant = {
  id: 'reads',
  title: 'read-only tools',
  direct: { server: 'solidcraft', command: cli, args: ['mcp', '--headless'] },
  // Both paths use a session of their own, so the benchmark never reads or edits a design open in the app.
  codemodeEnv: { CODEMODE_SOLIDCRAFT_HEADLESS: '1' },
  systemPrompt: 'You work in a 3D CAD session through the tools provided. Complete the task, then reply with one short sentence.',
  notes: [
    'Both paths start the same `solidcraft-cli mcp` server. The code API leaves out `screenshot` and `compare_picture` (they return images), so the direct path lists 23 tools and the codemode path can call 21.',
    'Only definition cost and one-call latency are measured, with read-only tools. There are no model-driven tasks yet: a modelling task needs a saved design to check, and a headless session of its own so it cannot touch an open app.',
  ],
  tasks: [],
};

export const solidcraft: BenchService = {
  id: 'solidcraft',
  title: 'SolidCraft (parametric CAD, read-only tools)',
  warning:
    'Starts `solidcraft-cli mcp --headless` (an empty session of its own, never the open app) and calls only read-only tools (version, listing, describing, inspecting, measuring). It writes nothing.',
  notes: ['The install is local software: the version in the results (`version`) is whatever is on the machine that ran it.'],
  defaultVariant: 'calls',
  variants: [callsVariant(base, solidcraftCalls)],
  calls: solidcraftCalls,
  async preflight() {
    if (!existsSync(cli) && cli !== 'solidcraft-cli') throw new Error(`SolidCraft CLI not found at ${cli}. Set SOLIDCRAFT_CLI.`);
  },
};
