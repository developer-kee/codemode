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
services/           one file per wrapped MCP server (blender, windows, playwright, filesystem), or a folder of
                    related ones (notion/token, notion/oauth)
bench/
  cli/              entrypoints: run, calls, report, validate
  lib/              reusable harness: runners (Claude, DSH), per-call benchmark, report building
  suites/<id>/      one service's tasks, cases, raw results and generated RESULTS.md
docs/landscape.md   comparison with other Code Mode implementations
docs/production.md  security, scaling and supply-chain research, and the plan
docs/mcp-candidates.md  which MCP servers would benefit from a wrapper (and docs/mcp-usage.md, generated)
test/               unit and end-to-end tests
scripts/            add-service scaffolder
```

## Services

Each service is one file in `services/` (`blender`, `windows`, `playwright`, `filesystem`), or a file inside a folder for a family (`notion/token`, `notion/oauth`), that names the upstream and optionally its limits and access rules:

```ts
// services/notion/token.ts
export default {
  name: 'notion-token',
  upstream: { ...npmServer('@notionhq/notion-mcp-server'), passEnv: ['NOTION_TOKEN'] },
} satisfies ServiceConfig;
```

```powershell
npm install
npm run servers:install                                   # the upstream MCP servers, from lockfiles
npm run add -- linear npx -y some-linear-mcp        # add a service (or: -- name --url https://...)
claude mcp add codemode-notion-token -- node C:\repos\codemode\src\cli.ts notion/token
npm run login -- notion/oauth                              # one-time browser sign-in for services that use OAuth
node src/cli.ts --list
```

Credentials go in the MCP client config `env` (e.g. `NOTION_TOKEN`) or, for a URL upstream, `headers`, never in this repo. A service whose server signs in with OAuth (`notion/oauth`) needs no credential in any config: `npm run login -- <service>` saves the tokens in your user profile (`%LOCALAPPDATA%\codemode\oauth` on Windows), and the running wrapper refreshes them. `notion/oauth` is read-only unless `CODEMODE_NOTION_WRITE=1`.
Blender needs Blender open with the BlenderMCP addon connected; Windows and Playwright drive the real desktop or browser, Notion writes to a real workspace, and Filesystem is confined to a sandbox folder, so read each warning in `bench/README.md` before exposing a service.

## Test

`npm test` runs the typechecker and the test suite. `npm run typecheck` alone checks types. `npm run bench:validate` checks the benchmark definitions, recorded runs, per-call data and generated reports (it starts no server and calls no model).


## Types

TypeScript 7, strict (incl. noUncheckedIndexedAccess, exactOptionalPropertyTypes, erasableSyntaxOnly). Node 24 runs the .ts files directly, so there is no build step; `npm run typecheck` runs tsc.
A service file should end with `satisfies ServiceConfig`.


## Benchmarks

Each service (Blender, Windows, Playwright, Filesystem and Notion) is benchmarked separately, in one folder `bench/suites/<service>/` that holds its tasks, per-tool-call cases, raw runs and generated `RESULTS.md`: the upstream MCP server used directly vs the same server behind codemode, same model and tasks. Each service has named variants (`scenarios`, `calls`, and for Windows `scenarios-4-tools`). The harness is model-agnostic: every record stores the model and the runner that drove it (`claude` for Claude Code, `dsh` for DeepSeek Harness headless), `--runner` defaults from the model id, and adding a model to an existing runner needs no report changes — a new harness is one new runner. The generated overview and each service report lead with a **Compare models** matrix: one column per model, showing token change, codemode/direct totals and pass counts, so providers can be compared side by side before the detailed tables.

Latest means of total tokens, codemode vs direct (all paths passed their objective checks):

| Service | Model (runner) | `scenarios` | `calls` (one tool call per task) |
|---|---|---|---|
| Blender | `claude-sonnet-5-5` (`claude`) | **-71%** | **-82%** |
| Windows (Windows-MCP) | `claude-sonnet-5-5` (`claude`) | **-65%** (20 tools); **-3%** with only 4 tools | **-78%** |
| Playwright | `claude-sonnet-5-5` (`claude`) | **-71%** | **-83%** |
| Playwright | `deepseek-flash` (`dsh`) | **-68%** | **-82%** |
| Filesystem (reference MCP server) | `claude-sonnet-5-5` (`claude`) | **-88%** | **-70%** |
| Notion | not run yet: needs `NOTION_TOKEN` and `NOTION_BENCH_PAGE_ID`, and the seeding code is untested against live Notion | | |

Read these with the caveats in [bench/README.md](bench/README.md): 3 runs per task and path, most of the saving is tool-definition overhead, and the two models run under different harnesses, so compare codemode vs direct **within** a row rather than comparing models. Overview and the side-by-side model comparison: [bench/RESULTS.md](bench/RESULTS.md). Rerun with `npm run bench -- --service blender --variant scenarios --runs 3` (needs a logged-in runner; read the service's warning first); `npm run bench -- --service playwright --model deepseek-flash --runs 3` uses the DSH runner, `npm run bench:calls -- --service blender` runs the no-model per-call benchmark, `npm run bench:validate` checks the recorded data, and `npm run bench -- --list` shows every service, variant and runner.

## Safety and limits

What the sandbox can and cannot do:

- No network, no filesystem, no imports, no `process`. The only way out is `codemode.*`, which the host runs against the upstream server.
- Credentials stay in the host process (the MCP client config `env` or `headers`); model-written code never sees them.
- **The upstream gets a minimal environment.** The child process receives the SDK's safe default (`PATH`, home and temp folders), the variables a service names in `upstream.passEnv` (for example `NOTION_TOKEN`) and its explicit `upstream.env`. The wrapper's other variables, which may hold unrelated secrets, are not inherited.
- **Remote upstreams must use https** (`http` is accepted only for `localhost`), because credentials and tool results travel over that connection.
- **Calls end with the script.** Upstream calls still running when a script finishes or times out are aborted, so a write cannot keep going after the model has been told the script is over. At most `maxConcurrentCalls` run at once.
- **Tool names cannot collide or shadow.** `read-file` and `read_file` become `read_file` and `read_file_2` instead of one replacing the other, and names such as `__proto__` or `constructor` are prefixed.
- **Risky tools are off by default where we know them.** `services/playwright.ts` leaves out `browser_run_code_unsafe` unless `CODEMODE_ALLOW_UNSAFE=1`. Use `access` for the rest. Upstream servers fetched with `uvx` or `npx` are pinned to an exact version.
- **Upstream servers install from lockfiles, not on every start.** `servers/package-lock.json` and `servers/python/uv.lock` pin every package and dependency with integrity hashes; `npm run servers:install` installs them (scripts disabled), and services launch them through `servers/resolve.ts`. A server that is not installed fails with that command in the message. `npm install`-time scripts of the upstream packages never run; note that an MCP server still runs its own entry point with your privileges, so pinning reduces surprise but is not a sandbox.
- **Changed tool definitions stop the server.** `services/<name>.lock.json` holds a hash of every upstream tool's description, schema and annotations. On start, a changed definition or an unknown new tool is refused, with what changed. Read the change, then accept it with `node src/cli.ts <name> --update-lock` (or `npm run lock:update`). `CODEMODE_LOCK=warn|off` and `CODEMODE_REQUIRE_LOCK=1` adjust this. A restricted variant (fewer tools) still passes; locks are written from the unrestricted set.
- **The audit trail leaves out the data.** `CODEMODE_AUDIT=<file>` appends one JSON line per script and per upstream call: time, duration, tool name, outcome, error class, and short hashes of the script and arguments. It never records code, argument values, results or error text, so it can stay on when tools return private data.
- **A warning when the dangerous combination is on.** Each service declares `capabilities` (private data, untrusted content, external communication). If all three are present and nothing in `access` narrows the service, the wrapper says so on stderr at start; use `access` or `--read-only`.
- `CODEMODE_DEBUG_LOG=<file>` is a debugging aid that writes every script and result to a file in plain text; the wrapper says so on stderr when it is set. Leave it unset when tools return private data.

Limits, set per service in `limits` (all optional):

| Limit | Default | What happens at the limit |
|---|---|---|
| `timeoutMs` | 60 000 ms, whole script including upstream calls | script is interrupted, error returned |
| `memoryBytes` | 128 MiB guest heap | script fails with an out-of-memory error |
| `maxLogChars` | 100 000 characters of `console` output | further log lines are dropped, the last kept line is marked truncated |
| `maxOutputChars` | 20 000 characters `execute_code` returns to the model | head 70% and tail 30% are kept with an `…[N characters omitted]…` marker; data the script holds in memory is not affected |
| `maxToolCalls` | 100 upstream calls per script | the next call throws "Tool call limit reached" |
| `maxConcurrentCalls` | 8 upstream calls running at once per script | further calls wait for a free slot |
| `maxStoreChars` | 1 048 576 characters (keys plus JSON) for the whole `store` | `store.set` throws "store is full" |

Arguments are checked against each tool's JSON schema before the call; a wrong shape throws with the expected signature. `get_api` returns full declarations and is not counted against `maxOutputChars`; pass the names you need rather than no names on a large catalogue.

**State across scripts.** The global `store` (`get(key)`, `set(key, value)`, `delete(key)`, `keys()`) keeps JSON-serialisable values for the life of the server process, across `execute_code` calls. It is memory only: it is lost when the server restarts.

**Access control.** A service can limit which upstream tools exist for the model:

```ts
access: { allow?: string[]; deny?: string[]; readOnly?: boolean }   // names are upstream MCP tool names
```

Tools that are not allowed are absent from the generated API, the index in the description and `get_api`, and calling one by name gives "Unknown tool". `deny` wins over `allow`. `readOnly: true` keeps only tools whose MCP annotations set `readOnlyHint: true`; tools without annotations are excluded, because the server cannot know they are safe. Turn it on without editing a service with `node src/cli.ts <service> --read-only` or `CODEMODE_READ_ONLY=1`. `destructiveHint` is not used. Note that `execute_code` itself is still one permission in the MCP client: once approved, every tool that remains is callable.

**Partial failure.** If a script fails midway (an error, the timeout, or the tool call cap), the upstream calls it already made are **not** undone. Writes that succeeded stay done. Keep destructive tools out of the API with `access`, and make scripts check before they write.
