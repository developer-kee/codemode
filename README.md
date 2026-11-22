# codemode

Wrap any MCP server as one `execute_code` tool (the "Code Mode" idea from Cloudflare's post). The model writes TypeScript that calls upstream tools, and only the script's return value and `console.log` output enter the conversation, not every intermediate tool result.

1. Connect to the upstream MCP server (stdio command or streamable-HTTP URL) and list its tools.
2. Generate a typed `declare const codemode: {...}` TypeScript API from the tool schemas.
3. Expose `execute_code`, whose description carries a compact index of every function (name, parameters, one-line summary) that fits inside the roughly 2,048-character tool-description limit clients such as Claude Code apply, plus `get_api` to return full declarations on demand.
4. Model-written code runs in a QuickJS (WASM) sandbox: no network, no fs, no imports, memory cap and timeout. Its only way out is `codemode.*`, which calls upstream tools from the host. Upstream credentials stay in the host environment.

Two tools instead of the upstream's full set is the point: the model pays for one short description, discovers detail only when it needs it, and can filter large results in code before anything reaches the context. For a small catalogue the fixed cost can outweigh the saving; see the 4-tool Windows result in the benchmark table below.

## Layout

```
src/                the wrapper: server, upstream transport, sandbox, API generation, description,
                    argument checks, output cap, shared store
services/           one file per wrapped MCP server (blender, notion, windows, playwright)
bench/
  cli/              entrypoints: run, calls, report, validate
  lib/              reusable harness: runners (Claude, DSH), per-call benchmark, report building
  suites/<id>/      one service's tasks, cases, raw results and generated RESULTS.md
  legacy/           one-off migration from the pre-layout folders
docs/landscape.md   comparison with other Code Mode implementations
test/               unit and end-to-end tests
scripts/            add-service scaffolder
vendor/addon.py     BlenderMCP addon copy for the Blender benchmark
```

## Services

Each service is one file in `services/` (`blender`, `notion`, `windows`, `playwright`) that names the upstream and optionally its limits and access rules:

```ts
// services/notion.ts
export default {
  name: 'notion',
  upstream: { command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'] },
} satisfies ServiceConfig;
```

```powershell
npm install
npm run add -- linear npx -y some-linear-mcp        # add a service (or: -- name --url https://...)
claude mcp add codemode-notion -- node C:\repos\codemode\src\cli.ts notion
node src/cli.ts --list
```

Credentials go in the MCP client config `env` (e.g. `NOTION_TOKEN`) or, for a URL upstream, `headers`, never in this repo.
Blender needs Blender open with the BlenderMCP addon connected; Windows and Playwright drive the real desktop or browser, so read their warnings in `bench/README.md` before exposing them.

## Test

`npm test` runs the typechecker and the test suite. `npm run typecheck` alone checks types. `npm run bench:validate` checks the benchmark definitions, recorded runs, per-call data and generated reports (it starts no server and calls no model).


## Types

TypeScript 7, strict (incl. noUncheckedIndexedAccess, exactOptionalPropertyTypes, erasableSyntaxOnly). Node 24 runs the .ts files directly, so there is no build step; `npm run typecheck` runs tsc.
A service file should end with `satisfies ServiceConfig`.


## Benchmarks

Each service (Blender, Windows, Playwright) is benchmarked separately, in one folder `bench/suites/<service>/` that holds its tasks, per-tool-call cases, raw runs and generated `RESULTS.md`: the upstream MCP server used directly vs the same server behind codemode, same model and tasks. Each service has named variants (`scenarios`, `calls`, and for Windows `scenarios-4-tools`). The harness is model-agnostic: every record stores the model and the runner that drove it (`claude` for Claude Code, `dsh` for DeepSeek Harness headless), `--runner` defaults from the model id, and adding a model to an existing runner needs no report changes — a new harness is one new runner. The generated overview and each service report lead with a **Compare models** matrix: one column per model, showing token change, codemode/direct totals and pass counts, so providers can be compared side by side before the detailed tables.

Latest means of total tokens, codemode vs direct (all paths passed their objective checks):

| Service | Model (runner) | `scenarios` | `calls` (one tool call per task) |
|---|---|---|---|
| Blender | `claude-sonnet-5-5` (`claude`) | **-72%** | **-82%** |
| Windows (Windows-MCP) | `claude-sonnet-5-5` (`claude`) | **-63%** (20 tools); **+8%** with only 4 tools | **-78%** |
| Playwright | `claude-sonnet-5-5` (`claude`) | **-71%** | **-83%** |
| Playwright | `deepseek-flash` (`dsh`) | **-68%** | **-82%** |

Read these with the caveats in [bench/README.md](bench/README.md): 3 runs per task and path, most of the saving is tool-definition overhead, and the two models run under different harnesses, so compare codemode vs direct **within** a row rather than comparing models. Overview and the side-by-side model comparison: [bench/RESULTS.md](bench/RESULTS.md). Rerun with `npm run bench -- --service blender --variant scenarios --runs 3` (needs a logged-in runner; read the service's warning first); `npm run bench -- --service playwright --model deepseek-flash --runs 3` uses the DSH runner, `npm run bench:calls -- --service blender` runs the no-model per-call benchmark, `npm run bench:validate` checks the recorded data, and `npm run bench -- --list` shows every service, variant and runner.

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
| `maxOutputChars` | 20 000 characters `execute_code` returns to the model | head 70% and tail 30% are kept with an `…[N characters omitted]…` marker; data the script holds in memory is not affected |
| `maxToolCalls` | 100 upstream calls per script | the next call throws "Tool call limit reached" |
| `maxStoreChars` | 1 048 576 characters (keys plus JSON) for the whole `store` | `store.set` throws "store is full" |

Arguments are checked against each tool's JSON schema before the call; a wrong shape throws with the expected signature. `get_api` returns full declarations and is not counted against `maxOutputChars`; pass the names you need rather than no names on a large catalogue.

**State across scripts.** The global `store` (`get(key)`, `set(key, value)`, `delete(key)`, `keys()`) keeps JSON-serialisable values for the life of the server process, across `execute_code` calls. It is memory only: it is lost when the server restarts.

**Access control.** A service can limit which upstream tools exist for the model:

```ts
access: { allow?: string[]; deny?: string[]; readOnly?: boolean }   // names are upstream MCP tool names
```

Tools that are not allowed are absent from the generated API, the index in the description and `get_api`, and calling one by name gives "Unknown tool". `deny` wins over `allow`. `readOnly: true` keeps only tools whose MCP annotations set `readOnlyHint: true`; tools without annotations are excluded, because the server cannot know they are safe. Turn it on without editing a service with `node src/cli.ts <service> --read-only` or `CODEMODE_READ_ONLY=1`. `destructiveHint` is not used. Note that `execute_code` itself is still one permission in the MCP client: once approved, every tool that remains is callable.

**Partial failure.** If a script fails midway (an error, the timeout, or the tool call cap), the upstream calls it already made are **not** undone. Writes that succeeded stay done. Keep destructive tools out of the API with `access`, and make scripts check before they write.
