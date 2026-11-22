# codemode-core

Wrap any MCP server as a single `execute_code` tool (the "Code Mode" idea from Cloudflare's post).

1. Connect to the upstream MCP server (stdio command or streamable-HTTP URL) and list its tools.
2. Generate a typed `declare const codemode: {...}` TypeScript API from the tool schemas.
3. Expose one tool, `execute_code`, whose description contains that API.
4. Model-written code runs in a QuickJS (WASM) sandbox: no network, no fs, no imports, a memory cap and a timeout. Its only way out is `codemode.*`, which calls the upstream tools from the host.

Upstream credentials live in the host process environment and are never visible to the sandbox.

## Use

```js
import { runCodeModeServer } from 'codemode-core';
runCodeModeServer({ name: 'x-codemode', upstream: { command: 'uvx', args: ['some-mcp'] } });
```

Per-service repos (`codemode-blender`, `codemode-notion`, ...) are thin wrappers around this.

## Test

`npm test`: sandbox behaviour, timeouts, and an end-to-end run against a fake upstream.
