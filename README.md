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
claude mcp add codemode-notion -- node C:\repos\codemode\src\cli.ts notion
node src/cli.ts --list
```

Credentials go in the MCP client config `env` (e.g. `NOTION_TOKEN`), never in this repo.
Blender needs Blender open with the BlenderMCP addon connected.

## Test

`npm test`


## Types

TypeScript 7, strict (incl. noUncheckedIndexedAccess, exactOptionalPropertyTypes, erasableSyntaxOnly). Node 24 runs the .ts files directly, so there is no build step; `npm run typecheck` runs tsc.
A service file should end with `satisfies ServiceConfig`.


## Benchmarks

Each service (Blender, Windows, Playwright) is benchmarked separately, in one folder `bench/<service>/` that holds its tasks, per-tool-call cases, raw runs and generated `RESULTS.md`: the upstream MCP server used directly vs the same server behind codemode, same model and tasks. Each service has named variants (`scenarios`, `calls`, and for Windows `scenarios-4-tools`). Overview: [bench/RESULTS.md](bench/RESULTS.md); method, per-service warnings and limitations: [bench/README.md](bench/README.md). Rerun with `npm run bench -- --service blender --variant scenarios --runs 3` (needs `claude auth login`; read the service's warning first); `npm run bench:calls -- --service blender` runs the no-model per-call benchmark, and `npm run bench -- --list` shows every service and variant.


