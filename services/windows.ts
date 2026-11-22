import type { ServiceConfig } from '../src/types.ts';
import { pythonServer } from '../servers/resolve.ts';

// Windows desktop control via https://github.com/CursorTouch/Windows-MCP (PyPI: windows-mcp).
//
// This gives model-written code real control of your PC: PowerShell, files, processes, registry, clicks,
// keystrokes, screenshots. Restrict it with CODEMODE_WINDOWS_TOOLS (comma-separated whitelist), e.g.
//   CODEMODE_WINDOWS_TOOLS=FileSystem,PowerShell,Process
// Leave it unset to expose every tool the server offers.
const whitelist = process.env['CODEMODE_WINDOWS_TOOLS']?.trim();

export default {
  name: 'windows',
  // Shell, files, registry, screenshots and network access, driven by whatever text the model has read.
  capabilities: { privateData: true, untrustedContent: true, externalComms: true },
  upstream: pythonServer('windows-mcp', 'serve', ...(whitelist ? ['--tools', whitelist] : [])),
} satisfies ServiceConfig;
