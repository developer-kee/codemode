# Per-tool-call benchmark: Windows (Windows-MCP, all tools)

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `<tool>-calls` service in `npm run bench`). Method and caveats: [../README.md](../README.md).

Generated 2026-11-22. 20 upstream tools, 8 cases over 6 tools, 10 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service windows --iters 10`.

## Definition cost per tool

What the model is sent for each tool on **every turn**. `Direct` is the tool's name, description and input schema as JSON. `Codemode, always sent` is that tool's line in the `execute_code` description (name, parameters, one-line summary). `On demand` is its full TypeScript declaration, which the model only receives if it calls `get_api`. Tokens are estimated as characters / 4: good for comparing rows with each other, not an exact count.

| Tool | Direct (≈ tokens) | Codemode, always sent (≈) | Codemode, on demand via get_api (≈) | In per-call cases |
|---|---|---|---|---|
| Snapshot | 455 | 31 | 365 | no |
| FileSystem | 399 | 34 | 289 | yes |
| App | 282 | 19 | 178 | no |
| Move | 251 | 13 | 177 | no |
| Screenshot | 236 | 22 | 181 | no |
| Scrape | 231 | 12 | 198 | no |
| Registry | 223 | 12 | 184 | yes |
| Type | 215 | 17 | 150 | no |
| Scroll | 200 | 14 | 152 | no |
| PowerShell | 197 | 8 | 195 | yes |
| WaitFor | 197 | 19 | 151 | no |
| Process | 193 | 14 | 140 | yes |
| Click | 181 | 10 | 142 | no |
| MultiSelect | 159 | 11 | 117 | no |
| Notification | 144 | 10 | 136 | no |
| MultiEdit | 128 | 7 | 98 | no |
| Shortcut | 108 | 6 | 92 | no |
| Clipboard | 106 | 7 | 94 | no |
| Wait | 103 | 5 | 100 | yes |
| DisplayInventory | 73 | 6 | 97 | yes |
| **Total sent every turn** | **4,078** | **479** (execute_code and get_api, with their fixed text) | | |

The biggest single definition is 455 tokens, 11% of the direct total.

**Truncation guard.** Claude Code cuts an MCP tool description at about 2,048 characters; anything past that never reaches the model. The `execute_code` description here is **1,504 characters** (fits), listing every function at detail level 2 (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../README.md).

## Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| PowerShell | 897 | 946 | 906 | 999 | +9.2 ms | 43 | 72 | 0/0 |
| FileSystem.list | 3.5 | 3.9 | 9.1 | 20 | +5.7 ms | 141 | 176 | 0/0 |
| FileSystem.read | 2.7 | 3.1 | 11 | 17 | +8.1 ms | 90 | 124 | 0/0 |
| FileSystem.write | 3.2 | 3.9 | 11 | 20 | +7.4 ms | 97 | 130 | 0/0 |
| Process.list | 978 | 1126 | 832 | 1252 | -146 ms | 279 | 312 | 0/0 |
| Registry.get | 905 | 938 | 920 | 932 | +15 ms | 99 | 131 | 0/0 |
| Wait | 1003 | 1005 | 1014 | 1021 | +11 ms | 21 | 47 | 0/0 |
| DisplayInventory | 4.0 | 4.2 | 12 | 18 | +8.4 ms | 306 | 549 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 16 ms, p95 17 ms. This is the floor of codemode's per-call overhead.

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
