# Benchmark: Calendar (dav-mcp over CalDAV), direct MCP vs codemode

- Pass/fail comes from the calendar server itself (events actually stored) or from values computed from the seed data, not from the model's claim.
- All times are UTC and the server runs with TZ=UTC, so zone-less times mean the same thing on both paths.
- Fully local: no cloud account, no real calendar data.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `scenarios`, `calls`. Method, metric definitions and limitations: [../../README.md](../../README.md).

> **Warning:** Starts a throwaway Radicale CalDAV server on http://127.0.0.1:5233 (127.0.0.1 only, data in bench/work/radicale/) with one fake account and a seeded calendar, and points the model at it. Needs `uvx` and `npx`, and port 5233 free. It never touches a real calendar or account.

## Models

Detailed results below are grouped by model family. Each family is produced by one runner and uses the same tasks and prompts; token counts are comparable within a family, not necessarily across runners, because each harness sends its own system prompt and tool guidance.

| Model | Provider | Runner | Runs | Variants |
|---|---|---|---|---|
| `claude-sonnet-5-5` | Claude | `claude` | 48 | `scenarios`, `calls` |

## Variant: `scenarios`, multi-step scenario tasks

- Both paths expose all 27 tools of the pinned `dav-mcp@5.1.2` (12 calendar, 8 contacts, 7 tasks). The benchmark only touches the calendar.
- `busiest-day` and `standup-hours` need many events read and counted; `free-slot` needs a free/busy calculation; `create-events` writes and is checked on the server afterwards.

Reproduce: `npm run bench -- --service calendar --variant scenarios --runs 3`.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| busiest-day | 3/3 / 3/3 | 51,814 | 10,791 | **-79%** | 9.6s | 14.4s | **50%** | $0.068 | $0.020 |
| standup-hours | 3/3 / 3/3 | 35,811 | 12,785 | **-64%** | 10.4s | 16.2s | **56%** | $0.036 | $0.035 |
| free-slot | 3/3 / 3/3 | 27,828 | 7,035 | **-75%** | 9.2s | 11.5s | **26%** | $0.015 | $0.019 |
| create-events | 3/3 / 3/3 | 27,961 | 6,721 | **-76%** | 9.7s | 12.3s | **27%** | $0.022 | $0.015 |

Token change ranges from **-79%** (busiest-day) to **-64%** (standup-hours).

##### Task: busiest-day

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 12,900 | 253 | 8,540 | 43,021 | 51,814 | $0.068 | 9.6s |
| codemode | 3/3 | 4.3 | 3.3 | 1,213 | 554 | 1,589 | 8,648 | 10,791 | $0.020 | 14.4s |

##### Task: standup-hours

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 12,921 | 476 | 3,125 | 32,210 | 35,811 | $0.036 | 10.4s |
| codemode | 3/3 | 4.3 | 3.3 | 1,234 | 907 | 3,212 | 8,666 | 12,785 | $0.035 | 16.2s |

##### Task: free-slot

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 12,923 | 243 | 532 | 27,053 | 27,828 | $0.015 | 9.2s |
| codemode | 3/3 | 3.0 | 2.0 | 1,236 | 367 | 2,056 | 4,611 | 7,035 | $0.019 | 11.5s |

##### Task: create-events

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 4.0 | 3.0 | 12,958 | 584 | 951 | 26,426 | 27,961 | $0.022 | 9.7s |
| codemode | 3/3 | 3.0 | 2.0 | 1,271 | 410 | 1,278 | 5,033 | 6,721 | $0.015 | 12.3s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 12/12 | 2.5 | 1.5 | 12,926 | 389 | 3,287 | 32,178 | 35,853 | $0.035 | 9.7s |
| codemode | 12/12 | 3.7 | 2.7 | 1,239 | 559 | 2,034 | 6,740 | 9,333 | $0.023 | 13.6s |

Total tokens, codemode vs direct: **-74%** (9,333 vs 35,853).

Wall time, codemode vs direct: **40%** (13.6s vs 9.7s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Variant: `calls`, one tool call per task

- Each task asks for exactly one upstream tool call (4 of 7 cases have a model prompt), so no single tool can dominate the totals and each tool is visible on its own row.
- Same cases as the deterministic latency benchmark (`npm run bench:calls`), so a tool can be followed from definition cost, to raw latency, to model tokens.
- Both paths expose all 27 tools of the pinned `dav-mcp@5.1.2` (12 calendar, 8 contacts, 7 tasks). The benchmark only touches the calendar.
- `busiest-day` and `standup-hours` need many events read and counted; `free-slot` needs a free/busy calculation; `create-events` writes and is checked on the server afterwards.

Reproduce: `npm run bench -- --service calendar --variant calls --runs 3`.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| list_calendars | 3/3 / 3/3 | 26,024 | 2,912 | **-89%** | 8.5s | 9.9s | **16%** | $0.010 | $0.005 |
| list_events | 3/3 / 3/3 | 27,736 | 8,072 | **-71%** | 8.8s | 11.0s | **25%** | $0.018 | $0.022 |
| calendar_query | 3/3 / 3/3 | 26,639 | 17,097 | **-36%** | 9.3s | 13.1s | **41%** | $0.014 | $0.069 |
| create_event | 3/3 / 3/3 | 26,506 | 5,643 | **-79%** | 8.6s | 10.7s | **24%** | $0.014 | $0.011 |

Token change ranges from **-89%** (list_calendars) to **-36%** (calendar_query).

##### Task: list_calendars

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 12,852 | 51 | 259 | 25,714 | 26,024 | $0.010 | 8.5s |
| codemode | 3/3 | 2.0 | 1.0 | 1,165 | 102 | 541 | 2,269 | 2,912 | $0.005 | 9.9s |

##### Task: list_events

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 12,879 | 218 | 1,215 | 26,303 | 27,736 | $0.018 | 8.8s |
| codemode | 3/3 | 3.0 | 2.0 | 1,192 | 275 | 2,791 | 5,006 | 8,072 | $0.022 | 11.0s |

##### Task: calendar_query

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 12,889 | 211 | 477 | 25,951 | 26,639 | $0.014 | 9.3s |
| codemode | 3/3 | 4.3 | 3.3 | 1,202 | 510 | 9,920 | 6,667 | 17,097 | $0.069 | 13.1s |

##### Task: create_event

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 12,897 | 216 | 487 | 25,803 | 26,506 | $0.014 | 8.6s |
| codemode | 3/3 | 3.0 | 2.0 | 1,210 | 269 | 954 | 4,419 | 5,643 | $0.011 | 10.7s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 12/12 | 2.0 | 1.0 | 12,879 | 174 | 609 | 25,943 | 26,726 | $0.014 | 8.8s |
| codemode | 12/12 | 3.1 | 2.1 | 1,192 | 289 | 3,552 | 4,590 | 8,431 | $0.027 | 11.2s |

Total tokens, codemode vs direct: **-68%** (8,431 vs 26,726).

Wall time, codemode vs direct: **27%** (11.2s vs 8.8s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Per-tool-call benchmark (no model)

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `calls` variant in `npm run bench`). Method and caveats: [../../README.md](../../README.md).

Generated 2026-11-22. 27 upstream tools, 7 cases over 7 tools, 6 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service calendar --iters 6`.

### Definition cost per tool

What the model is sent for each tool on **every turn**. `Direct` is the tool's name, description and input schema as JSON. `Codemode, always sent` is that tool's line in the `execute_code` description (name, parameters, one-line summary). `On demand` is its full TypeScript declaration, which the model only receives if it calls `get_api`. Tokens are estimated as characters / 4: good for comparing rows with each other, not an exact count.

| Tool | Direct (≈ tokens) | Codemode, always sent (≈) | Codemode, on demand via get_api (≈) | In per-call cases |
|---|---|---|---|---|
| update_event | 1,138 | 3 | 1,062 | no |
| update_todo | 1,098 | 3 | 1,017 | no |
| calendar_query | 448 | 4 | 422 | yes |
| freebusy_query | 421 | 4 | 396 | yes |
| update_contact | 412 | 4 | 347 | no |
| addressbook_query | 363 | 4 | 341 | no |
| make_calendar | 360 | 3 | 328 | no |
| todo_query | 348 | 3 | 320 | no |
| create_event | 308 | 3 | 266 | yes |
| create_todo | 270 | 3 | 234 | no |
| update_calendar | 260 | 4 | 237 | no |
| update_todo_raw | 244 | 4 | 223 | no |
| delete_contact | 238 | 4 | 225 | no |
| update_event_raw | 232 | 4 | 211 | no |
| delete_event | 227 | 3 | 214 | no |
| delete_todo | 225 | 3 | 212 | no |
| list_events | 216 | 3 | 201 | yes |
| create_contact | 202 | 4 | 164 | no |
| update_contact_raw | 161 | 5 | 141 | no |
| delete_calendar | 122 | 4 | 116 | no |
| addressbook_multi_get | 113 | 5 | 96 | no |
| list_contacts | 112 | 3 | 106 | no |
| calendar_multi_get | 110 | 5 | 93 | no |
| list_todos | 91 | 3 | 83 | yes |
| todo_multi_get | 84 | 4 | 73 | no |
| list_addressbooks | 59 | 4 | 63 | yes |
| list_calendars | 54 | 4 | 56 | yes |
| **Total sent every turn** | **7,913** | **309** (execute_code and get_api, with their fixed text) | | |

The biggest single definition is 1,138 tokens, 14% of the direct total.

**Truncation guard.** Claude Code cuts an MCP tool description at about 2,048 characters; anything past that never reaches the model. The `execute_code` description here is **842 characters** (fits), listing every function at detail level 3 (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../../README.md).

### Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| list_calendars | 46 | 47 | 49 | 51 | +2.8 ms | 362 | 370 | 0/0 |
| list_events | 139 | 146 | 142 | 146 | +3.2 ms | 2,398 | 2,406 | 0/0 |
| calendar_query | 92 | 96 | 93 | 94 | +1.2 ms | 3,046 | 3,054 | 0/0 |
| freebusy_query | 138 | 143 | 140 | 144 | +2.0 ms | 643 | 651 | 0/0 |
| create_event | 115 | 119 | 119 | 125 | +3.7 ms | 495 | 503 | 0/0 |
| list_todos | 66 | 68 | 68 | 70 | +1.5 ms | 15 | 23 | 0/0 |
| list_addressbooks | 36 | 38 | 38 | 41 | +2.6 ms | 23 | 31 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 0.9 ms, p95 1.1 ms. This is the floor of codemode's per-call overhead.

### Coverage

Cases cover 7 of 27 tools. The rest are skipped on purpose:

| Tool | Why it is not benchmarked |
|---|---|
| update_event | Needs the etag from a previous read of the event. |
| update_event_raw | Needs the etag from a previous read of the event. |
| delete_event | Needs the etag from a previous read, and the event is gone after the first call. |
| make_calendar | Not repeatable: the calendar exists after the first call. |
| update_calendar | Changes the calendar everything else depends on. |
| delete_calendar | Deletes the calendar everything else depends on. |
| calendar_multi_get | Needs event URLs from a previous listing. |
| list_contacts | Contacts (CardDAV) are outside this calendar benchmark. |
| create_contact | Contacts (CardDAV) are outside this calendar benchmark. |
| update_contact | Contacts (CardDAV) are outside this calendar benchmark. |
| update_contact_raw | Contacts (CardDAV) are outside this calendar benchmark. |
| delete_contact | Contacts (CardDAV) are outside this calendar benchmark. |
| addressbook_query | Contacts (CardDAV) are outside this calendar benchmark. |
| addressbook_multi_get | Contacts (CardDAV) are outside this calendar benchmark. |
| create_todo | Tasks (VTODO) are outside this calendar benchmark. |
| update_todo | Tasks (VTODO) are outside this calendar benchmark. |
| update_todo_raw | Tasks (VTODO) are outside this calendar benchmark. |
| delete_todo | Tasks (VTODO) are outside this calendar benchmark. |
| todo_query | Tasks (VTODO) are outside this calendar benchmark. |
| todo_multi_get | Tasks (VTODO) are outside this calendar benchmark. |

### Cases

| Case | Arguments | Model prompt |
|---|---|---|
| list_calendars | `{}` | yes |
| list_events | `{"calendar_url":"http://127.0.0.1:5233/bench/work/","time_range_start":"2026-12-09T00:00:00Z","time_range_end":"2026-12-10T00:00:00Z"}` | yes |
| calendar_query | `{"calendar_url":"http://127.0.0.1:5233/bench/work/","summary_filter":"Demo","limit":5}` | yes |
| freebusy_query | `{"time_range_start":"2026-12-09T09:00:00Z","time_range_end":"2026-12-09T17:00:00Z","calendar_url":"http://127.0.0.1:5233/bench/work/"}` | latency only |
| create_event | `{"calendar_url":"http://127.0.0.1:5233/bench/work/","summary":"Bench event","start_date":"2026-12-29T10:00:00Z","end_date":"2026-12-29T11:00:00Z"}` | yes |
| list_todos | `{"calendar_url":"http://127.0.0.1:5233/bench/work/"}` | latency only |
| list_addressbooks | `{}` | latency only |

## Task prompts

Identical text is sent on both paths. Prompts never name tools.

### `scenarios`

- **busiest-day** (pre-seeded): The calendar at http://127.0.0.1:5233/bench/work/ (called Work) holds the events of December 2026, all in UTC. Which single day of December has the most events, and how many events does it have? Reply with one short sentence.
- **standup-hours** (pre-seeded): The calendar at http://127.0.0.1:5233/bench/work/ (called Work) holds the events of December 2026. Add up the lengths of all events titled exactly "Standup" and tell me the total in hours as a decimal number, and how many Standup events there are. Reply with one short sentence.
- **free-slot** (pre-seeded): In the calendar at http://127.0.0.1:5233/bench/work/ (called Work), find the earliest one-hour gap on 9 December 2026 between 09:00 and 17:00 UTC in which no event is scheduled. Reply with one short sentence that gives the start time as HH:MM.
- **create-events** (pre-seeded): In the calendar at http://127.0.0.1:5233/bench/work/ (called Work) create three events, all times in UTC: "Offsite" on 30 December 2026 from 10:00 to 12:00, "Dentist" on 30 December 2026 from 14:00 to 15:00, and "Retro" on 31 December 2026 from 09:00 to 10:00. Reply with one short sentence.

### `calls`

- **list_calendars** (pre-seeded): List the calendars on the calendar server and tell me the name of each in one short sentence.
- **list_events** (pre-seeded): How many events are on 9 December 2026 (UTC) in the calendar at http://127.0.0.1:5233/bench/work/? Reply with one short sentence.
- **calendar_query** (pre-seeded): In the calendar at http://127.0.0.1:5233/bench/work/ find the event titled "Demo" on 9 December 2026 and tell me its start time in UTC, in one short sentence.
- **create_event** (pre-seeded): In the calendar at http://127.0.0.1:5233/bench/work/ create an event titled "Lunch" on 29 December 2026 from 12:00 to 13:00 UTC, then reply with one short sentence.
