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

Each tool is benchmarked separately: the upstream MCP server used directly vs the same server behind codemode, same model and tasks. Overview: [bench/RESULTS.md](bench/RESULTS.md); method, per-tool warnings and limitations: [bench/README.md](bench/README.md). Rerun with `npm run bench -- --service blender --runs 3` (needs `claude auth login`; read the tool's warning first).

## Safety and limits

What the sandbox can and cannot do:

- No network, no filesystem, no imports, no `process`. The only way out is `codemode.*`, which the host runs against the upstream server.
- Credentials stay in the host process (the MCP client config `env` or `headers`); model-written code never sees them.

Limits, set per service in `limits` (all optional):

| Limit | Default | What happens at the limit |
|---|---|---|
| `timeoutMs` | 60 000 ms, whole script including upstream calls | script is interrupted, error returned |
| `memoryBytes` | 128 MiB guest heap | script fails with an out-of-memory error |
| `maxLogChars` | 100 000 characters of `console` output | further log lines are dropped, the last kept line is marked truncated |
| `maxOutputChars` | 20 000 characters returned to the model | head 70% and tail 30% are kept with an `…[N characters omitted]…` marker; data the script holds in memory is not affected |
| `maxToolCalls` | 100 upstream calls per script | the next call throws "Tool call limit reached" |
| `maxStoreChars` | 1 048 576 characters (keys plus JSON) for the whole `store` | `store.set` throws "store is full" |

Arguments are checked against each tool's JSON schema before the call; a wrong shape throws with the expected signature.

**State across scripts.** The global `store` (`get(key)`, `set(key, value)`, `delete(key)`, `keys()`) keeps JSON-serialisable values for the life of the server process, across `execute_code` calls. It is memory only: it is lost when the server restarts.

**Access control.** A service can limit which upstream tools exist for the model:

```ts
access: { allow?: string[]; deny?: string[]; readOnly?: boolean }   // names are upstream MCP tool names
```

Tools that are not allowed are absent from the generated API, the index in the description and `get_api`, and calling one by name gives "Unknown tool". `deny` wins over `allow`. `readOnly: true` keeps only tools whose MCP annotations set `readOnlyHint: true`; tools without annotations are excluded, because the server cannot know they are safe. Turn it on without editing a service with `node src/cli.ts <service> --read-only` or `CODEMODE_READ_ONLY=1`. `destructiveHint` is not used. Note that `execute_code` itself is still one permission in the MCP client: once approved, every tool that remains is callable.

**Partial failure.** If a script fails midway (an error, the timeout, or the tool call cap), the upstream calls it already made are **not** undone. Writes that succeeded stay done. Keep destructive tools out of the API with `access`, and make scripts check before they write.
