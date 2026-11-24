# Which MCP servers benefit from a codemode wrapper

A guide to deciding whether to build a wrapper for a given MCP server, based on what the benchmark in this repo measured ([../bench/RESULTS.md](../bench/RESULTS.md)). Each claim says what it rests on: our measurements, or the catalogue shape (how many tools a server offers, counted from tool lists, with "about" marking counts made by eye).

## What the measurements say

The saving comes mostly from two things:

1. **How many tool definitions the model no longer has to carry.** With 4 tools there is almost no saving (3% fewer tokens, 42% more cost in the Windows 4-tool run). With 10 to 77 tools, definitions drop 90% to 99% and a whole task uses 65% to 89% fewer tokens.
2. **Results the script can filter instead of the model reading them.** Filesystem `log-triage`: 118,043 tokens directly against 5,356 through codemode.

Codemode does not reliably help time. A script replaces many turns only when the task has many steps; it adds a `get_api` turn when the model needs a declaration it has not seen.

## Candidates

| Server | Tools (about) | Wrapper in this repo | Verdict | Why |
|---|---|---|---|---|
| Notion, hosted (OAuth) | 77 | `notion/oauth` | **Strong** | Largest catalogue; listing and querying pages and databases returns long records |
| Notion, self-hosted (token) | 24 | `notion/token` | **Strong** | Same data, a smaller catalogue; no OAuth needed |
| SolidCraft (parametric CAD) | 23 | `solidcraft` | **Yes** | Many small tools; a script can build, measure and verify a part in one call |
| Playwright / browser | 25 | `playwright` | **Yes, for scripted work** | Page snapshots are big; interactive exploration is a worse fit |
| Linear | 72 | none | **Strong** | Issue and project lists are big and usually filtered afterwards |
| Gmail | not counted | none | **Likely, check first** | Message bodies are large and mostly irrelevant to the question asked |
| Google Drive | not counted | none | **Likely, check first** | Long documents, small answers |
| Google Calendar | 9 | none | **Weak** | Few tools. A CalDAV wrapper we built saved 74% of tokens but was 27% to 56% slower |
| Figma | 7 | none | **Weak** | Results are large but the model needs them verbatim to write code |
| Documentation lookups (for example Context7) | 2 | none | **No** | Nothing to save; the documentation text is the point |
| Desktop control (computer use) | 28 | none | **No** | One UI step per call; every step needs the model to look at the screen |

## How to decide, before building one

A wrapper is worth building when most of these are true. The first two matter most.

1. **The catalogue is large**: 15 tools or more, or tool definitions of 5,000 tokens or more. Below about 10 tools the fixed saving is small.
2. **Results are big and then filtered**: lists, searches, records, pages, where the question needs a few fields. Results of 8,000 characters or more are the signal (`npm run mcp:usage` counts them in your own Claude Code transcripts).
3. **Calls come in chains** of 3 or more to the same service with no other tool between them.
4. **The data does not need to reach the model verbatim.** If the model has to read the whole result to do the job (documentation, design context), a script cannot help.
5. **An upstream you can run exists** with credentials you control (a self-hosted server, an API token) or an OAuth sign-in the wrapper supports (`npm run login -- <service>`), pinned and lockable.
6. **You can test it safely**: a throwaway workspace, a local sandbox, or read-only access (see [production.md](production.md)).

Skip it when the tool is a single lookup, when every step depends on seeing the screen, or when the saving would only be the smaller definition on a catalogue of a handful of tools.

## Measuring your own usage

`npm run mcp:usage` reads your local Claude Code transcripts and writes `docs/mcp-usage.md`: tool names, call counts and result sizes only, with no arguments, results, prompts or paths. The file is git-ignored because it describes your own sessions. Run it after a few weeks of real use and read it against the criteria above.

## A standing instruction (optional)

To prefer codemode wrappers wherever one exists, add a section like this to your client's global instructions (for Claude Code, `~/.claude/CLAUDE.md`). It is guidance the model follows, not enforcement; a stricter version uses Claude Code permission rules (`ask` or `deny` for specific `mcp__<server>__*` tools), which have to be listed per server, because a pattern broad enough to cover every MCP tool would also catch the codemode wrappers.

```
## MCP tools: prefer codemode wrappers

Before calling a tool from an MCP server (other than the client's own servers):

1. Look for a codemode wrapper: run `node <path to codemode>/src/cli.ts --list`. A registered wrapper shows up as
   tools named mcp__codemode-<service>__execute_code and mcp__codemode-<service>__get_api; use those instead of
   the direct tools.
2. If no wrapper exists for that server, do not call its tools yet. Say which server it is, how many tools it
   has and whether its results are large, and ask whether a wrapper should be built. Go on with the direct tools
   only after the answer.
3. If the answer is to use the direct tools, do so for that task only.
```

Register a wrapper with `claude mcp add codemode-<service> -- node <path to codemode>/src/cli.ts <service>` (after `npm run servers:install`).
