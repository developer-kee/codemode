<p align="center">
  <img src="docs/icon.svg" width="96" height="96" alt="codemode icon: curly braces around a play button">
</p>

# codemode

**codemode lets an AI model use any MCP server by writing a short script instead of calling tools one at a time.** It sits between the model and an existing MCP server, and cuts what the model has to read: tool definitions, intermediate results, and round trips.

It is an implementation of the **"Code Mode" idea, originally published by Cloudflare**: [blog.cloudflare.com/code-mode](https://blog.cloudflare.com/code-mode/). This repo applies it to local MCP servers (Blender, Windows, Playwright, Filesystem, Notion) and adds a benchmark that measures what it saves. See [Original source and credits](#original-source-and-credits).

<p align="center">
  <img src="docs/codemode.svg" alt="Without codemode the model sees 77 tool definitions (58,037 tokens) every turn and every result passes through it. With codemode it sees two tools (573 tokens), writes one script that runs in a sandbox against the same tools, and only the return value comes back." width="900">
</p>

## The problem it solves

MCP servers give a model many tools. That costs context in three ways:

1. **Tool definitions are sent on every turn.** A server with 10 to 77 tools puts roughly 3,400 to 58,000 tokens of descriptions and schemas in front of the model before it does anything. Notion's hosted server alone is about 58,000.
2. **Every intermediate result goes through the model.** To answer "which owner has the most open tasks?" the model fetches all the tasks, reads them, and then counts, even though the answer is one line.
3. **Multi-step work takes many round trips.** Each tool call is a model turn, and each turn re-reads the whole conversation.

## What codemode does

The model sees **two tools** instead of dozens:

| Tool | Purpose |
|---|---|
| `execute_code` | Runs a TypeScript or JavaScript script against a typed `codemode.*` API generated from the upstream's tools |
| `get_api` | Returns the full type declarations for specific functions, only when the model asks |

The model writes the loop, filter or join itself, and only the script's `return` value and `console.log` output come back:

```ts
// One execute_code call replaces a search, a fetch of 40 rows, and the counting the model would do in its head.
const rows = await codemode.notion_query_data_sources({ /* ... */ });
const open = rows.filter((r) => r.status !== 'Done');
return Object.entries(Object.groupBy(open, (r) => r.owner)).map(([owner, rs]) => [owner, rs.length]);
```

How it works:

1. Connect to the upstream MCP server (a local command, or an https URL with OAuth or headers) and list its tools.
2. Generate a typed `declare const codemode: {...}` API from the tool schemas.
3. Put a compact index of every function (name, parameters, one-line summary) in the `execute_code` description, kept under the roughly 2,048-character limit that clients such as Claude Code apply. `get_api` supplies the rest on demand.
4. Run the model's script in a sandbox (QuickJS compiled to WebAssembly, on a worker thread): no network, no files, no imports. Its only way out is `codemode.*`, which the host runs against the upstream. Credentials stay in the host process.

## Does it work? Results at a glance

Same model, same tasks, same server, used directly versus behind codemode, and every run is checked objectively (the check inspects the real result, not the model's claim). Change in **codemode vs direct**, for the multi-step `scenarios` tasks:

| Service | Tools | Tokens | Cost | Wall time | Passed (codemode / direct) |
|---|---|---|---|---|---|
| Filesystem | 16 | **-88%** | **-89%** | **-47%** | 12/12 and 12/12 |
| Notion (hosted, OAuth) | 77 | **-89%** | **-64%** | -3% | 5/6 and 6/6 |
| Blender | 10 | **-71%** | -24% | 0% | 12/12 and 12/12 |
| Playwright | 25 | **-71%** | -26% | +8% | 9/9 and 9/9 |
| Windows | 20 | **-65%** | -8% | +2% | 9/9 and 9/9 |
| Windows, only 4 tools | 4 | -3% | **+42%** | -19% | 9/9 and 9/9 |
| Notion (self-hosted token) | 24 | not run yet | | | |

How to read this:

- **Most of the saving is tool-definition overhead.** With only 4 tools there is almost none (-3% tokens), and cost went **up** 42%. Codemode pays off on large catalogues and on large results that a script can filter (Filesystem log triage: 118,043 tokens down to 5,356).
- **Token savings are bigger than cost savings.** Cached tokens are cheap, so a 71% token cut is a 24% cost cut for Blender.
- **Time is about the same** except where a script replaces many turns (Filesystem). Codemode adds a `get_api` turn when the model needs a declaration it hasn't seen.
- The Notion OAuth failure was a check that wanted the digit 7 when the model wrote "Seven"; the check now accepts words, and the record is kept as run.
- 3 runs per task and path, one Claude model (plus DeepSeek for Playwright). Treat these as measurements of this setup, not guarantees. Details and caveats: [bench/README.md](bench/README.md); every number above is in [bench/RESULTS.md](bench/RESULTS.md) and each service's `RESULTS.md`, which start with a TL;DR.

## What the benchmark measures

Each service is run on two paths, **direct** and **codemode**, with the same model, prompts, system prompt and budget. Claude Code's built-in tools are off, so the only difference is the MCP server the model sees.

| Metric | What it is |
|---|---|
| **Total tokens** | Everything the model processed in the run: new input, cache writes, cache reads and output |
| **First-turn context** | Size of the first request: system prompt, tool definitions and task. Isolates the fixed cost of tool schemas |
| **Cost** | Dollar spend as reported by the runner (`n/a` for runners that don't report it) |
| **Turns, tool calls** | Model round trips and MCP calls |
| **Wall time** | Whole run, including server start-up, model latency and the tool's own execution |
| **Pass** | Whether a check written in code accepted the real outcome (a Blender scene snapshot, files on disk, a database read back). A run passes only if the state is right |

Two benchmarks with no model, so they cost nothing and repeat exactly:

| Metric | What it is |
|---|---|
| **Definition cost per tool** | Tokens each tool's definition costs the model on every turn, direct versus codemode (the always-sent index line, and the on-demand `get_api` declaration) |
| **Latency per call** | Milliseconds for one tool call, direct versus through codemode, plus the sandbox's own overhead (about 0.8 ms for an empty script) |

The `calls` variant also runs one model-driven task per tool, so no single tool can dominate an average. Method and limitations: [bench/README.md](bench/README.md).

## When codemode helps, and when it doesn't

Worth it: large catalogues (about 15 tools or more), results that are big and then filtered, and chains of three or more calls. Not worth it: a handful of tools, single lookups, or work where the model must read the full result anyway (documentation, design context). A longer note on candidates is in [docs/mcp-candidates.md](docs/mcp-candidates.md).

## Quick start

```powershell
npm install
npm run servers:install                          # the upstream MCP servers, from lockfiles
node src/cli.ts --list                           # services available
claude mcp add codemode-filesystem -- node C:\repos\codemode\src\cli.ts filesystem
```

Each service is one folder in `services/`:

| Service | Wraps | Needs |
|---|---|---|
| `blender` | BlenderMCP | Blender open with the BlenderMCP addon connected. Benchmark runs wipe the open scene |
| `windows` | Windows-MCP | A Windows desktop; gives the model PowerShell, files and input |
| `playwright` | `@playwright/mcp` | A browser; `browser_run_code_unsafe` is off unless `CODEMODE_ALLOW_UNSAFE=1` |
| `filesystem` | The reference Filesystem server | Directories via `CODEMODE_FILESYSTEM_DIRS` |
| `notion/token` | The self-hosted Notion server (24 tools) | `NOTION_TOKEN` (an integration token) |
| `notion/oauth` | Notion's hosted server (77 tools) | `npm run login -- notion/oauth` once; no token in any config |

`notion/oauth` can write. After any script that calls a tool the server marks destructive (update, delete, move, cancel), the result ends with a notice naming the tool and the count. `CODEMODE_NOTION_READ_ONLY=1` offers only its read-only tools.

**Add a service:** `npm run add -- linear npx -y some-mcp` (or `-- name --url https://...`) creates `services/linear/index.ts`. A service file names the upstream and optionally its limits and access rules, and ends with `satisfies ServiceConfig`:

```ts
// services/notion/token.ts
export default {
  name: 'notion-token',
  upstream: { ...npmServer('@notionhq/notion-mcp-server'), passEnv: ['NOTION_TOKEN'] },
} satisfies ServiceConfig;
```

**Credentials** go in the MCP client config `env` (for example `NOTION_TOKEN`) or, for a URL upstream, `headers`, never in this repo. For OAuth services, `npm run login -- <service>` saves tokens in your user profile (`%LOCALAPPDATA%\codemode\oauth` on Windows) and the running wrapper refreshes them.

Read each service's warning in [bench/README.md](bench/README.md) before exposing it: Windows and Playwright drive the real desktop or browser, Notion writes to a real workspace, and Filesystem is confined to a sandbox folder.

## Safety

Model-written code is untrusted. These are the protections, in order from the script outward.

**The sandbox**

- No network, no filesystem, no imports, no `process`. The only way out is `codemode.*`.
- **Scripts run on their own thread.** A script that loops forever or runs out of memory costs a worker thread that is terminated, not the wrapper: its timers, MCP connection and other scripts keep running. Cost: about 0.2 ms more per script.
- **Calls end with the script.** Upstream calls still running when a script finishes or times out are aborted, so a write cannot keep going after the model has been told the script is over. At most `maxConcurrentCalls` run at once.
- **One result cannot flood the sandbox.** An upstream result over `maxResultChars` (10,000,000 by default) is refused with advice to ask for less, before it is copied into the script. This does not stop the MCP client library from reading a very large response into memory first.
- Arguments are checked against each tool's JSON schema before the call; a wrong shape throws with the expected signature.
- **Tool names cannot collide or shadow.** `read-file` and `read_file` become `read_file` and `read_file_2`, and names such as `__proto__` or `constructor` are prefixed.

**The upstream and the network**

- **The upstream gets a minimal environment**: the SDK's safe default (`PATH`, home and temp folders), the variables a service names in `upstream.passEnv`, and its explicit `upstream.env`. The wrapper's other variables are not inherited.
- **Remote upstreams must use https** (`http` only for `localhost`). A remote host that resolves to a private, link-local or cloud-metadata address (10.x, 192.168.x, 169.254.169.254, ...) is refused, for the MCP endpoint and any OAuth endpoint it points to. Not covered: a DNS answer that changes between the check and the connection (rebinding).
- **Upstream servers install from lockfiles, not on every start.** `servers/package-lock.json` and `servers/python/uv.lock` pin every package with integrity hashes; `npm run servers:install` installs them with scripts disabled. An MCP server still runs its own entry point with your privileges, so pinning reduces surprise but is not a sandbox.
- **Changed tool definitions stop the server.** Each service has a lock file beside it holding a hash of every upstream tool's description, schema and annotations. On start, a changed definition or an unknown new tool is refused, with what changed. Read the change, then accept it with `node src/cli.ts <service> --update-lock` (or `npm run lock:update`). `CODEMODE_LOCK=warn|off` and `CODEMODE_REQUIRE_LOCK=1` adjust this. A restricted variant still passes.

**What you can see and control**

- **Destructive calls are reported.** After any script that calls a tool the upstream marks `destructiveHint: true`, the result ends with a notice naming the tool and how often it ran.
- **The audit trail leaves out the data.** `CODEMODE_AUDIT=<file>` appends one JSON line per script and per upstream call: time, duration, tool name, outcome, error class and short hashes. It never records code, argument values, results or error text.
- **A warning when the dangerous combination is on.** Each service declares `capabilities` (private data, untrusted content, external communication). If all three are present and nothing in `access` narrows the service, the wrapper says so on stderr at start.
- **Risky tools are off by default where we know them** (for example Playwright's `browser_run_code_unsafe`). Use `access` for the rest.
- `CODEMODE_DEBUG_LOG=<file>` writes every script and result to a file in plain text. It is a debugging aid; leave it unset when tools return private data.

### Limits

Set per service in `limits` (all optional):

| Limit | Default | What happens at the limit |
|---|---|---|
| `timeoutMs` | 60 000 ms, whole script including upstream calls | script is interrupted, error returned |
| `memoryBytes` | 128 MiB guest heap | script fails with an out-of-memory error |
| `maxLogChars` | 100 000 characters of `console` output | further log lines are dropped, the last kept line is marked truncated |
| `maxOutputChars` | 20 000 characters `execute_code` returns to the model | head 70% and tail 30% are kept with an `…[N characters omitted]…` marker |
| `maxToolCalls` | 100 upstream calls per script | the next call throws "Tool call limit reached" |
| `maxConcurrentCalls` | 8 upstream calls at once per script | further calls wait for a free slot |
| `maxResultChars` | 10 000 000 characters per upstream result | the call throws and asks for less |
| `maxStoreChars` | 1 048 576 characters (keys plus JSON) for the whole `store` | `store.set` throws "store is full" |

`get_api` is not counted against `maxOutputChars`; pass the names you need rather than no names on a large catalogue.

**State across scripts.** The global `store` (`get(key)`, `set(key, value)`, `delete(key)`, `keys()`) keeps JSON-serialisable values for the life of the server process. It is memory only: it is lost when the server restarts.

**Access control.** A service can limit which upstream tools exist for the model:

```ts
access: { allow?: string[]; deny?: string[]; readOnly?: boolean }   // names are upstream MCP tool names
```

Tools that are not allowed are absent from the generated API, the index and `get_api`, and calling one by name gives "Unknown tool". `deny` wins over `allow`. `readOnly: true` keeps only tools whose annotations set `readOnlyHint: true`; tools without annotations are excluded. Turn it on without editing a service with `--read-only` or `CODEMODE_READ_ONLY=1`. Note that `execute_code` itself is one permission in the MCP client: once approved, every tool that remains is callable.

**Partial failure.** If a script fails midway (an error, the timeout, or the tool-call cap), the upstream calls it already made are **not** undone. Keep destructive tools out of the API with `access`, and make scripts check before they write.

## Original source and credits

**The idea.** Code Mode, as published by Cloudflare: have the model write code against a typed API generated from MCP tools, instead of calling the tools one by one.

- Cloudflare, "Code Mode": [blog.cloudflare.com/code-mode](https://blog.cloudflare.com/code-mode/) (the original post)
- Cloudflare, "Code Mode MCP": [blog.cloudflare.com/code-mode-mcp](https://blog.cloudflare.com/code-mode-mcp/), and the guide [Build a Code Mode MCP server](https://developers.cloudflare.com/agents/model-context-protocol/guides/build-codemode-mcp-server/)
- Anthropic, "Code execution with MCP": [anthropic.com/engineering/code-execution-with-mcp](https://www.anthropic.com/engineering/code-execution-with-mcp), the same pattern described independently

This repo is not affiliated with Cloudflare or Anthropic; it is a separate implementation. How it compares with other implementations (Claude Code's own Code Mode, FastMCP, Pydantic, the Universal Tool Calling Protocol and others), and what we took from each: [docs/landscape.md](docs/landscape.md).

**Built with:** the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) (client and server), [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten) (the QuickJS engine as WebAssembly, for the sandbox), [json-schema-to-typescript](https://github.com/bcherny/json-schema-to-typescript) (tool schemas to types), [sucrase](https://github.com/alangpierce/sucrase) (strips TypeScript from scripts) and [Ajv](https://ajv.js.org/) (argument checks). The upstream servers it wraps are third-party projects, pinned in `servers/`.

## Repository layout

```
src/                the wrapper: server, upstream transport, OAuth, sandbox (worker thread), API generation,
                    description, argument checks, output cap, shared store
services/           one folder per wrapped MCP server, each with its tool-definition lock
servers/            the upstream MCP servers, installed from lockfiles
bench/              the benchmark: cli/ (entrypoints), lib/ (harness), suites/<id>/ (tasks, raw runs, RESULTS.md)
docs/               landscape.md (other Code Mode implementations), production.md (security and scaling plan),
                    mcp-candidates.md and mcp-usage.md (which servers would benefit)
test/               unit and end-to-end tests
scripts/            add-service, login, lock update, usage analysis
```

## Development

TypeScript 7, strict (including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `erasableSyntaxOnly`). Node 24 runs the `.ts` files directly, so there is no build step.

| Command | What it does |
|---|---|
| `npm test` | Typecheck, then the test suite |
| `npm run typecheck` | Types only |
| `npm run bench:validate` | Checks benchmark definitions, recorded runs and generated reports (starts no server, calls no model) |
| `npm run bench -- --service blender --variant scenarios --runs 3` | Model-driven benchmark (needs a logged-in runner; read the service's warning first) |
| `npm run bench:calls -- --service blender` | The no-model per-call benchmark |
| `npm run bench -- --list` | Every service, variant and runner |
| `npm run lock:verify` | Check each service still starts under its committed lock |
