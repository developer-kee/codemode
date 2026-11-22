# Per-tool-call benchmark: Windows (Windows-MCP, all tools)

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `<tool>-calls` service in `npm run bench`). Method and caveats: [../README.md](../README.md).

Generated 2026-11-22. 20 upstream tools, 8 cases over 6 tools, 10 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service windows --iters 10`.

## Definition cost per tool

What the model is sent for each tool on **every turn**. `Direct` is the tool's name, description and input schema as JSON; `codemode` is that tool's slice of the generated TypeScript API. Tokens are estimated as characters / 4, good for comparing rows with each other, not an exact count.

| Tool | Direct (≈ tokens) | Codemode (≈ tokens) | In per-call cases |
|---|---|---|---|
| Snapshot | 455 | 365 | no |
| FileSystem | 399 | 289 | yes |
| App | 282 | 178 | no |
| Move | 251 | 177 | no |
| Screenshot | 236 | 181 | no |
| Scrape | 231 | 198 | no |
| Registry | 223 | 184 | yes |
| Type | 215 | 150 | no |
| Scroll | 200 | 152 | no |
| PowerShell | 197 | 195 | yes |
| WaitFor | 197 | 151 | no |
| Process | 193 | 140 | yes |
| Click | 181 | 142 | no |
| MultiSelect | 159 | 117 | no |
| Notification | 144 | 136 | no |
| MultiEdit | 128 | 98 | no |
| Shortcut | 108 | 92 | no |
| Clipboard | 106 | 94 | no |
| Wait | 103 | 100 | yes |
| DisplayInventory | 73 | 97 | yes |
| **Total** | **4,078** | **3,354** (includes 107 fixed for `execute_code`) | |

The biggest single definition is 455 tokens, 11% of the direct total.

> **Important: these two totals are what each side _tries_ to send, not what the model receives.** The codemode total is about the same size as the direct total because the generated TypeScript API carries the same information as the tool schemas. In Claude Code, though, an MCP tool description is cut at about 2,048 characters. Asking the model to quote its `execute_code` description (Blender) returned about 2,070 characters ending in "… [truncated]", and the first-turn context of codemode runs stays near 1.7k tokens for both Blender and Windows regardless of API size. The generated API lists the types first and the callable `codemode.*` members last, so the model sees the types of the first few tools and never the member list. Token savings measured by the model-driven benchmarks therefore include an unknown share that is **missing information**, not compression. Treat those savings as an upper bound until the description is restructured to fit the cap.

## Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| PowerShell | 888 | 919 | 907 | 923 | +20 ms | 43 | 72 | 0/0 |
| FileSystem.list | 3.4 | 3.6 | 12 | 20 | +8.6 ms | 141 | 176 | 0/0 |
| FileSystem.read | 3.2 | 3.8 | 16 | 23 | +13 ms | 90 | 124 | 0/0 |
| FileSystem.write | 3.0 | 3.2 | 7.6 | 21 | +4.5 ms | 97 | 130 | 0/0 |
| Process.list | 735 | 768 | 742 | 848 | +7.7 ms | 279 | 312 | 0/0 |
| Registry.get | 910 | 921 | 923 | 933 | +13 ms | 99 | 131 | 0/0 |
| Wait | 1003 | 1003 | 1009 | 1021 | +6.4 ms | 21 | 47 | 0/0 |
| DisplayInventory | 2.4 | 2.8 | 11 | 21 | +8.4 ms | 306 | 549 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 4.1 ms, p95 17 ms. This is the floor of codemode's per-call overhead.

## Coverage

Cases cover 6 of 20 tools. The rest are skipped on purpose:

| Tool | Why it is not benchmarked |
|---|---|
| App | Launches programs and moves windows on your desktop. |
| Snapshot | Captures your screen and UI tree; the image would be sent to the model. |
| Screenshot | Captures your screen; the image would be sent to the model. |
| Click | Sends mouse input to your desktop. |
| Type | Sends keystrokes to your desktop. |
| Scroll | Sends mouse input to your desktop. |
| Move | Moves the mouse on your desktop. |
| Shortcut | Sends key combinations to whatever window has focus. |
| MultiSelect | Sends mouse input to your desktop. |
| MultiEdit | Sends keystrokes to your desktop. |
| Clipboard | Reads your clipboard, which can hold private data. |
| Notification | Pops a visible toast notification on your desktop. |
| Scrape | Fetches an external web page; latency depends on the network, not on the tool. |
| WaitFor | Needs a live UI condition to wait on. |

## Cases

| Case | Arguments | Model prompt |
|---|---|---|
| PowerShell | `{"command":"Write-Output codemode-ok-4821"}` | yes |
| FileSystem.list | `{"mode":"list","path":"C:\\Users\\KEE-YA~1\\AppData\\Local\\Temp\\codemode-bench-windows-calls"}` | yes |
| FileSystem.read | `{"mode":"read","path":"C:\\Users\\KEE-YA~1\\AppData\\Local\\Temp\\codemode-bench-windows-calls\\a.txt"}` | yes |
| FileSystem.write | `{"mode":"write","path":"C:\\Users\\KEE-YA~1\\AppData\\Local\\Temp\\codemode-bench-windows-calls\\out.txt","content":"written-4821","overwrite":true}` | yes |
| Process.list | `{"mode":"list","sort_by":"memory","limit":5}` | yes |
| Registry.get | `{"mode":"get","path":"HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion","name":"ProductName"}` | yes |
| Wait | `{"duration":1}` | yes |
| DisplayInventory | `{}` | latency only |
