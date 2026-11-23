import { existsSync } from 'node:fs';
import type { ServiceConfig } from '../../src/types.ts';

// SolidCraft, a parametric 3D CAD app, through its own MCP server: `solidcraft-cli mcp` (23 tools). It drives the app
// when its window is open (you watch the model appear) and builds headless otherwise.
//
// The server limits file access itself: recovery files, its temp folder and the folders of designs opened or saved
// through it. Add more folders with CODEMODE_SOLIDCRAFT_ALLOW_PATHS (separated by ";"). This service never passes
// --allow-any-path; if you want that, you are choosing to lift the limit, so add it to the command yourself.
//
// `screenshot` and `compare_picture` are left out of the code API: they return images, and a script cannot show an image
// to the model (it would get the base64 text). Ask for screenshots with the SolidCraft MCP server directly.
//
// Tools the server marks `destructiveHint: true` include `execute` and `batch` (a command can delete features), so the
// notice after a script that models something will name them; that is accurate to the server's own annotations.
const DEFAULT_CLI = 'C:\\Program Files\\SolidCraft\\solidcraft-cli.exe';
const cli = process.env['SOLIDCRAFT_CLI'] ?? (existsSync(DEFAULT_CLI) ? DEFAULT_CLI : 'solidcraft-cli');
// Which session the scripts work in:
//  - With the app's bridge on (Preferences > Extend > Assistant > "Let AI agents connect", default port 27878), the CLI
//    finds the running app by itself and scripts edit the design you are looking at; `execute` and `batch` can delete
//    features in it. Without the bridge the CLI starts a headless session that nobody can see.
//  - CODEMODE_SOLIDCRAFT_HEADLESS=1 forces the headless session even when the app is running (use it for tests and benchmarks).
//  - CODEMODE_SOLIDCRAFT_CONNECT=127.0.0.1:PORT picks a different bridge port (CODEMODE_SOLIDCRAFT_TOKEN if the app shows
//    one). Only this machine is accepted.
const headless = ['1', 'true'].includes(process.env['CODEMODE_SOLIDCRAFT_HEADLESS'] ?? '');
const connect = process.env['CODEMODE_SOLIDCRAFT_CONNECT']?.trim();
if (connect && !/^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(connect)) {
  throw new Error(`CODEMODE_SOLIDCRAFT_CONNECT must be this machine and a port, such as 127.0.0.1:27878 (got "${connect}")`);
}
if (connect && headless) throw new Error('CODEMODE_SOLIDCRAFT_CONNECT and CODEMODE_SOLIDCRAFT_HEADLESS cannot both be set');
const token = process.env['CODEMODE_SOLIDCRAFT_TOKEN']?.trim();
const allowPaths = (process.env['CODEMODE_SOLIDCRAFT_ALLOW_PATHS'] ?? '').split(';').map((p) => p.trim()).filter(Boolean);

export default {
  name: 'solidcraft',
  // Reads and writes design files (within the server's allowed folders); no network, and no untrusted text beyond files you open.
  capabilities: { privateData: true, untrustedContent: false, externalComms: false },
  instructions:
    "Start a model with codemode.skill_reference({ skill: 'solidcraft-modeling' }), then call measure({}) after each stage and compare volume and bbox with your numbers. Screenshots are not available here.",
  access: { deny: ['screenshot', 'compare_picture'] },
  upstream: { command: cli, args: ['mcp', ...(headless ? ['--headless'] : []), ...(connect ? ['--connect', connect, ...(token ? ['--token', token] : [])] : []), ...allowPaths.flatMap((p) => ['--allow-path', p])] },
} satisfies ServiceConfig;
