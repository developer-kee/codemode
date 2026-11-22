# Code Mode landscape: what others do, and what to learn

Notes from reading other Code Mode implementations on 2026-11-22. Facts come from each project's own docs or posts as fetched that day; they may have changed. Nothing here has been run by us unless it says so. Licenses, maintenance and security of the repos listed under "Other repos" were **not** checked.

## Implementations compared

| Project | Where code runs | What the model sees | Discovery of tools | Notable limits and design choices |
|---|---|---|---|---|
| **This repo** | QuickJS (WASM) in the wrapper process | 1 tool, `execute_code`, with the whole typed `codemode.*` API in its description | None: full API in the description | 60 s timeout, 128 MiB heap, no network or fs. Credentials stay in the host. No call cap, no result-size cap, no arg validation |
| [Cloudflare `@cloudflare/codemode`](https://developers.cloudflare.com/agents/model-context-protocol/guides/build-codemode-mcp-server/) | V8 isolate via Worker Loader (`DynamicWorkerExecutor`) | `codeMcpServer()` wraps an existing MCP server into one `code` tool; `openApiMcpServer()` gives `search` + `execute` | `search` runs model-written code over `codemode.spec()`; only the returned slice enters context | Single-tool pattern needs the declarations to fit in the tool description. Final responses capped at about 6,000 estimated tokens (`--- TRUNCATED ---`). Experimental, "not for production". No per-operation approval |
| [Cloudflare MCP server](https://blog.cloudflare.com/code-mode-mcp/) | Dynamic Worker | 2 tools, `search()` and `execute()`, each taking one `code` string | Full OpenAPI spec (2,500+ endpoints) exposed as a `spec` object to search code, never in context | Claims about 1,000 tokens vs 1.17 million, "99.9%", measured with tiktoken; the method is not described (see "Numbers to be careful with") |
| [FastMCP `CodeMode`](https://gofastmcp.com/docs/servers/transforms/code-mode) (Python, experimental) | `MontySandboxProvider` (pluggable) | `search`, `get_schema`, `execute` (opt-in `GetTags`, `ListTools`) | BM25 `Search` with `brief` / `detailed` / `full` detail levels | `max_tool_calls` default 50, `max_memory` 100 MB, `max_feed_duration_secs` 30, optional `wall_clock_timeout_secs`. Calls pass through the normal authorization checks |
| [Pydantic AI Harness `CodeMode`](https://pydantic.dev/docs/ai/harness/code-mode/) | Monty (a Python subset), local or remote | One `run_code` tool; tools appear as `async def` stubs | `dynamic_catalog` option | Type-checks the first snippet and returns diagnostics; `max_retries` 3; 30 s and 256 MiB per snippet, `max_tool_calls` 100; tools needing approval stay native; supports Temporal and DBOS durable execution; `repl_store` keeps state |
| [Pi `codemode`](https://docs.pi.dev/latest/codemode) | QuickJS | One `codemode` tool, methods on `tools` | `searchTools()` (BM25, default 8), `describeTool()`, `describeNamespace()`; a declared-tool budget with `codemode.mode` `on` or `only` | 256 MB VM; output head+tail truncation with full text written to a temp file; `store()`/`load()` persistence per session branch; scripts can call classifier and image models; calls made before a failure are not undone |
| [Claude Code Code Mode](https://code.claude.com/docs/en/code-mode) | In the Claude Code session (not a separate sandbox) | A `REPL` tool; Claude writes JavaScript calling tools like `edit(...)` and `` $`rg ...` `` | Not described on the page | Experimental, off by default (see the section below) |

## Lessons for this repo, in priority order

1. **Do not put a large API in one tool description.** Claude Code cuts MCP tool descriptions at about 2,048 characters (we checked by asking the model to quote its description: about 2,070 characters, ending "… [truncated]"). Every serious implementation above keeps the fixed surface small and lets the model look up detail on demand: Cloudflare `search`, FastMCP `search` + `get_schema`, Pi `searchTools` + `describeTool`, Pydantic `dynamic_catalog`. For us: put a compact index of `codemode.name(args): ReturnType` lines first (they fit), and add a `get_api(tool?)` call returning full declarations. Our current output puts types first and the callable members last, which the cap removes. This invalidates the size of our measured token savings; see `bench/README.md`.
2. **Hard limits beyond time and memory.** FastMCP (`max_tool_calls` 50) and Pydantic (100) cap calls per run because a loop can fan out into many side effects. Pi and Cloudflare cap and truncate returned output. We have neither a tool-call cap nor a result-size cap.
3. **Validate arguments before the call and return useful errors.** Pydantic type-checks and feeds diagnostics back; the Windows per-call runs show our model spending 3 to 5 tool calls guessing argument shapes (`Wait` took 6 turns). Checking inputs against each tool's JSON schema in the bridge, and answering with the expected shape, should cut those retries.
4. **Rethink permissions.** `execute_code` collapses every upstream tool into one permission, so approving it once also approves PowerShell and registry writes. Claude Code's own Code Mode keeps `deny`/`ask` rules and `PreToolUse` hooks for each inner call; Pydantic keeps `requires_approval` tools native; Cloudflare says plainly that neither of its patterns gives per-operation approval. Options for us: a per-service allowlist, honouring MCP `readOnlyHint` / `destructiveHint` annotations, and leaving destructive tools out of the code API.
5. **State across calls.** Pi (`store`/`load`) and Pydantic (`repl_store`) persist values between scripts so the model need not re-fetch data. Worth testing on multi-step tasks.
6. **Keep what we already do right:** credentials stay in the host, the sandbox has no network or filesystem, upstream errors become catchable exceptions, `structuredContent` is passed through, and text results are parsed as JSON. That matches Cloudflare's guidance.
7. **Partial failure is real.** Pi documents that calls made before a script failure are not undone. Our docs should say so, and destructive tools should be rare in generated code.

## Numbers to be careful with

- Cloudflare's **99.9%** (1.17 million to about 1,000 tokens) compares every endpoint as a tool against a two-tool surface. The post states only that it was "measured with tiktoken", and elsewhere says "over 2 million tokens", without reconciling the two. A critique of the [dev.to summary](https://dev.to/volodymyr_nehir/what-is-code-mode-how-to-cut-ai-agent-context-by-99-using-code-instead-of-json-rpc-4klf) points out that its "99%" covers upfront tool definitions only, compares against dumping every schema into context (a baseline that deferred tool loading already beats), and that its one measured workflow (Goose) shows about 31%.
- Secondary write-ups report a wide spread: about 32% (simple) to 81% (complex), 78.5% input tokens with slightly higher latency (10.37 s vs 9.66 s), and one comparison where a UTCP-style approach used **more** tokens than baseline because large data arrays were passed as parameters. A 2026 IJCA paper reports that Code Mode degrades with less capable models. These come from vendor blogs and search snippets we did not verify.
- Our own: Blender -74% and Windows -56% tokens (20 tools), -11% (4 tools). **These are upper bounds**, because of the description truncation above.

## Other repos doing the same job

Found by search; only titles and one-line descriptions were read, so treat as leads.

| Repo | What it is |
|---|---|
| [modus-data/mcp_codemode](https://github.com/modus-data/mcp_codemode) | npm package: generates TypeScript interfaces from filtered tools, checks the code compiles, runs in a sandbox |
| [blas0/code2mcp](https://github.com/blas0/code2mcp) | Reference implementation of Cloudflare's pattern; single `execute_code` tool for Claude Code |
| [universal-tool-calling-protocol/code-mode](https://github.com/universal-tool-calling-protocol/code-mode) | UTCP code mode with a GitHub MCP example and `callToolChain` |
| [cexll/code-mode-mcp](https://glama.ai/mcp/servers/cexll/code-mode-mcp) | Runs TypeScript in a forked Node process; bridges MCP calls over IPC; `generate-api` script |
| [zbowling/mcpcodeserver](https://mcpservers.org/vi/servers/zbowling/mcpcodeserver) | Exposes tools to list sub-servers, fetch TypeScript definitions, and generate and run code |
| [replicate/replicate-mcp-code-mode](https://github.com/replicate/replicate-mcp-code-mode) | Replicate SDK in a Deno sandbox |
| [draphonix/mcp-code-mode](https://github.com/draphonix/mcp-code-mode), [danieliser/codemode-unified](https://github.com/danieliser/codemode-unified), [cnap-tech/codemode](https://github.com/cnap-tech/codemode) | Further variants |
| pctx (`pctx_code_mode` on docs.rs) | Rust implementation |

Benchmarks and measurement repos worth reading for method: [imran31415/godemode](https://github.com/imran31415/godemode), [imran31415/codemode_python_benchmark](https://github.com/imran31415/codemode_python_benchmark), [hyang0129/onlycodes](https://github.com/hyang0129/onlycodes), [AgiFlow/token-usage-metrics](https://github.com/AgiFlow/token-usage-metrics), Anthropic's [code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp), and arXiv 2602.15945.

What we could not find in this search: another harness that benchmarks each upstream tool call separately, with objective state checks, against the same upstream used directly. That gap is what `bench/` tries to fill.

## Claude Code's own Code Mode: note for a future benchmark

Source: <https://code.claude.com/docs/en/code-mode>, read 2026-11-22. This is a different feature from this repo, so it is a **comparison target**, not something to copy.

- **What it is:** experimental and off by default. Claude writes JavaScript that makes several tool calls in one step, and Claude Code runs it inside the session. Only the final expression returns to the model. The page says it "may change or be removed in any release".
- **Enable:** `CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1` (shell, or `env` in `~/.claude/settings.json`), then confirm once. Project settings ignore it; managed settings can force it off with `0`. Needs Claude Code v2.1.323 or later (v2.1.326 for agent teams).
- **Requirements:** an Anthropic API or subscription account (not Bedrock, Vertex, Foundry or a gateway); Opus 5.5, Sonnet 5.5, Haiku 5.5 or Fable 5.2; Windows needs Git for Windows. Blocked by an API key helper, OpenTelemetry export or `DISABLE_TELEMETRY`; incompatible with HIPAA and zero data retention.
- **Surfaces:** interactive terminal only. **Not** `claude -p`, the Agent SDK, the IDE panel, Desktop or cloud sessions. This is the main obstacle to benchmarking it: our harness drives `claude -p`, so a comparison needs a different driver for the interactive terminal.
- **Permissions:** every inner call still goes through `deny`/`ask` rules and `PreToolUse` hooks under the tool's normal name. In auto mode a classifier reviews each piece of code, not each call. The tool is called `REPL`; hooks can match it and read `tool_input.code`. The sandbox covers shell commands only, so the JavaScript and its file, web and MCP calls run outside it.
- **Limits:** code stops after ten minutes (background code can run up to two hours in auto or `bypassPermissions` mode).
- **What the page does not say:** how MCP tools are exposed, any discovery mechanism, or any token numbers. A [blog post about it](https://www.joancomadran.dev/blog/claude-code-code-mode) is secondhand ("I have not measured Code Mode on my own work") and its only figure, 37% (43,588 to 27,297 tokens), comes from Anthropic's API programmatic tool calling post, a different feature.

**Plan, for later** (not started): once this repo's services are built, compare per service (a) direct MCP, (b) this wrapper, and (c) Claude Code Code Mode on the same tasks and checks, using the existing per-tool cases. Needs: a driver for the interactive terminal (pseudo-terminal or manual runs), a way to read token usage from `/cost` or `/status` (the blog suggests this), and version pinning (the feature changed between v2.1.323 and v2.1.325). Re-read the docs before starting; this section will be stale.

## Metrics worth adding to the benchmark

Today we record total tokens split into fresh input, cache read and output; cost; turns; tool calls; first-turn context; wall time; pass/fail. Candidates, with why:

| Metric | Why it matters | Effort |
|---|---|---|
| **Visible API coverage**: fraction of tools whose signature actually reached the model (detect `[truncated]` in the description, or ask the model to list them) | Would have caught the 2,048-character cap. A guard, not a statistic | Low |
| **Scaling curve**: tokens versus catalogue size (5, 20, 100, 500 synthetic tools) for direct, direct with deferred tool loading, codemode, codemode with search | The headline claim is about large catalogues; our two tools have 10 and 20. Also gives the fair baseline critics ask for | Medium |
| **Fair baseline: deferred tool loading** | A 99% saving against "every schema in context" is not a saving against lazy loading | Medium |
| **Discovery cost**: calls and tokens spent finding the right tool or arguments; **first-try success** of the first code snippet | Separates "API is large" from "API is unclear". Windows per-call runs show 3 to 5 calls on simple tools | Low (count from `toolNames` and errors) |
| **Retries and error classes**: syntax, type, argument, sandbox limit, upstream error | Shows where codemode fails, not just whether | Low |
| **Context bytes kept out**: size of intermediate tool results versus what reached the model | The real claim of Code Mode is filtering big results in code; needs tasks that return large payloads (we only touched this with Blender `look`) | Medium |
| **Cumulative context over a session**: total tokens across N consecutive tasks in one conversation | Tests the "intermediate results pile up" argument that the single-task runs cannot | Medium |
| **Success rate with confidence intervals**, more runs, and **model matrix** (Haiku, Sonnet, Opus) | 3 runs per cell is too few; the IJCA result says weaker models may do worse | Low (just more runs) |
| **Cost, not just tokens**, plus cache hit rate | Our Windows 20-tool run used 56% fewer tokens but cost more ($0.022 vs $0.018); cache writes are priced higher | Low (already recorded) |
| **Latency split**: model time versus tool time versus sandbox overhead (`apiMs` is recorded now) | Tells whether wall time is the model or the wrapper | Low |
| **Output tokens (code the model writes)** versus tool-call JSON | Code can be longer than a call | Low (already recorded) |
| **Safety tests**: infinite loop, memory bomb, output flood, attempted network and fs access, credential leakage, runaway tool-call loops | A sandbox claim needs adversarial tests, and these are cheap with no model | Medium |
| **Partial-failure behaviour**: what is left changed when a script dies mid-way | Pi documents that earlier calls are not undone | Medium |

## Open questions

- Does MCP tool search in Claude Code already defer large catalogues, and does it apply under `claude -p`? The 20-tool direct runs sent all 20 schemas (first-turn context 7.8k), so not at this size.
- How far can the description be shortened before the model guesses wrong? The compact-index change in lesson 1 is the experiment.
- Should this repo expose a read-only mode by default? See lesson 4.
