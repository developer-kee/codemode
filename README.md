# codemode

Wrap any MCP server as a single `execute_code` tool (the "Code Mode" idea from Cloudflare's post).

1. Connect to the upstream MCP server (stdio command or streamable-HTTP URL) and list its tools.
2. Generate a typed `declare const codemode: {...}` TypeScript API from the tool schemas.
3. Expose one tool, `execute_code`, whose description contains that API.
4. Model-written code runs in a QuickJS (WASM) sandbox: no network, no fs, no imports, memory cap and timeout. Its only way out is `codemode.*`, which calls upstream tools from the host. Upstream credentials stay in the host environment.

## Services

Each service is one file in `services/` (currently: `blender`, `notion`).

```powershell
npm install
npm run add -- linear npx -y some-linear-mcp        # add a service (or: -- name --url https://...)
claude mcp add codemode-notion -- node C:\repos\codemode\src\cli.js notion
node src/cli.js --list
```

Credentials go in the MCP client config `env` (e.g. `NOTION_TOKEN`), never in this repo.
Blender needs Blender open with the BlenderMCP addon connected.

## Test

`npm test`
