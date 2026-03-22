# Anvil: Iterative Code Forging Engine — Claude Code Native

**Date:** 2026-03-22
**Status:** Ready for Review
**Author:** Abdullah (with Claude Opus 4.6)

---

## 1. Overview

Anvil is an open-source iteration engine that runs natively inside Claude Code. It automates the retry loop for fixing bugs, passing tests, and completing tasks — learning from every attempt and persisting knowledge across sessions using Claude Code's native memory system (`CLAUDE.md` + `MEMORY.md` + memory files).

### What It Replaces

The original LISA (in MCP Gateway) depends on:
- **Empirica** for epistemic tracking → replaced by **memory files** (`memory/anvil-journal.md`)
- **Cipher** for cross-session memory → replaced by **Claude Code native memory** (`MEMORY.md` + `memory/anvil-learnings.md`)
- **MCP Gateway** as runtime → replaced by **Claude Code skill/hook system**
- **External agent CLI** (`claude -p`, `aider`) → replaced by **Claude Code subagents** (Agent tool)

### Design Principles

1. **Zero required dependencies** — works with Claude Code alone in Lite mode; optional Smart mode adds local vector search
2. **Native integration** — uses Claude Code's skill, hook, memory, and subagent systems as intended
3. **Full observability** — every iteration is journaled; user sees progress and can intervene
4. **Portable** — installable via npm, configurable per-project, works for anyone with Claude Code
5. **Learns from failure** — reads past learnings before each run, writes structured journals after

---

## 2. Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────┐
│                   Claude Code Session                │
│                                                      │
│  ┌──────────────┐    ┌───────────────────────────┐  │
│  │  Thin Hooks   │───►│   Anvil Skill (/anvil)    │  │
│  │  (detection   │    │                           │  │
│  │   + suggest)  │    │  ┌─────────────────────┐  │  │
│  └──────────────┘    │  │  Iteration Controller │  │  │
│                      │  │  (state machine)      │  │  │
│                      │  └──────────┬────────────┘  │  │
│                      │             │               │  │
│                      │    ┌────────┴────────┐      │  │
│                      │    ▼                 ▼      │  │
│                      │  ┌──────────┐ ┌──────────┐ │  │
│                      │  │ Subagent │ │ Verifier │ │  │
│                      │  │ (Agent)  │ │ (Bash)   │ │  │
│                      │  └──────────┘ └──────────┘ │  │
│                      │             │               │  │
│                      │             ▼               │  │
│                      │  ┌──────────────────────┐  │  │
│                      │  │   Memory Manager     │  │  │
│                      │  │  (Read/Write/Edit)   │  │  │
│                      │  └──────────────────────┘  │  │
│                      └───────────────────────────┘  │
│                                                      │
│  Memory Files (persistent):                          │
│  ├── MEMORY.md (index)                               │
│  ├── memory/anvil-journal.md (full iteration log)    │
│  ├── memory/anvil-learnings.md (distilled solutions) │
│  └── memory/anvil-config.md (per-project preferences)│
└─────────────────────────────────────────────────────┘
```

### Three Components

| Component | Responsibility | Complexity |
|-----------|---------------|------------|
| **Skill** (`/anvil`) | Iteration loop, subagent dispatch, memory read/write, verification, journaling | High — all logic lives here |
| **Hooks** | Detect test/build failures, suggest `/anvil` to user | Low — detection only, no logic |
| **CLI** (`npx anvil-cc`) | One-time setup: register skill + hooks into Claude Code config | Low — scaffolding only |

---

## 3. Skill: `/anvil`

### Invocation

```
/anvil "Fix failing unit tests" --verify "npm test" --max 5
/anvil "Fix TypeScript errors" --verify tsc
/anvil "Fix lint errors" --verify eslint
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `task` | Yes | — | What to fix/accomplish |
| `--verify` | No | — | Shell command or built-in check name |
| `--max` | No | 5 | Maximum iterations |

### Built-in Verification Checks

Instead of requiring users to write shell commands for common patterns:

| Check Name | Equivalent Shell | Trigger |
|------------|-----------------|---------|
| `tsc` | `npx tsc --noEmit` | TypeScript compilation |
| `eslint` | `npx eslint . --max-warnings 0` | Linting |
| `jest` | `npx jest --passWithNoTests` | Jest tests |
| `vitest` | `npx vitest run` | Vitest tests |
| `pytest` | `python -m pytest` | Python tests |
| `build` | `npm run build` | Build script |
| `cargo` | `cargo build` | Rust build |
| `go` | `go build ./...` | Go build |

Users can still pass any arbitrary shell command via `--verify "custom command here"`.

### Iteration State Machine

```
                    ┌──────────┐
                    │  INIT    │
                    └────┬─────┘
                         │
                    ┌────▼─────┐
              ┌─────│  RECALL  │  (read memory/anvil-learnings.md)
              │     └────┬─────┘
              │          │
              │     ┌────▼─────┐
              │     │  DISPATCH│  (spawn subagent with task + context)
              │     └────┬─────┘
              │          │
              │     ┌────▼─────┐
              │     │  VERIFY  │  (run verification command)
              │     └────┬─────┘
              │          │
              │    ┌─────┴──────┐
              │    │            │
              │  PASS         FAIL
              │    │            │
              │    ▼            ▼
              │ ┌──────┐  ┌──────────┐
              │ │JOURNAL│  │JOURNAL   │
              │ │+LEARN │  │+RETRY?   │
              │ └──┬───┘  └────┬─────┘
              │    │           │
              │    ▼      ┌────┴────┐
              │  DONE     │         │
              │         iter<max  iter>=max
              │           │         │
              │           ▼         ▼
              └───────►DISPATCH   FAILED
```

### State Details

#### INIT
- Parse arguments (task, verify command, max iterations)
- Resolve built-in check names to shell commands
- Create task list for user visibility

#### RECALL
- **Smart mode** (if ChromaDB available): Embed current task description → semantic search top 5 most similar past learnings from local vector index → inject into subagent prompt
- **Lite mode** (fallback): Read `memory/anvil-learnings.md` → keyword match on task description → inject top 5 matches into subagent prompt
- If no matches found in either mode: proceed without prior context
- RECALL budget: max 2000 tokens of prior learnings injected (prevents context bloat)

#### DISPATCH
- Build prompt for subagent:
  ```
  TASK: {task description}
  ITERATION: {n} of {max}
  VERIFICATION: {verify command}

  {if first iteration and has prior learnings}
  PAST CONTEXT:
  {relevant learnings from memory}

  {if retry after failure}
  PREVIOUS ATTEMPT FAILED:
  {error output from verification, truncated to 2000 chars}

  WHAT WAS TRIED:
  {summary of previous iteration's approach}

  INSTRUCTIONS:
  - Try a DIFFERENT approach than what failed before
  {end if}

  INSTRUCTIONS:
  1. Analyze the problem
  2. Make the minimal fix needed
  3. Do NOT run the verification yourself
  4. Explain what you changed and why (one paragraph)
  ```
- Spawn subagent via Agent tool with `subagent_type: "general"`
- Subagent runs in the same workspace (not isolated worktree) so changes are visible
- Report subagent's summary to user

#### VERIFY
- Run the verification command via Bash tool
- Capture stdout, stderr, and exit code
- Timeout: 120 seconds (configurable)

#### JOURNAL (after every iteration, pass or fail)
- Append to `memory/anvil-journal-YYYY-MM.md` (current month's file, created if needed):
  ```markdown
  ## Run: {timestamp} | Task: {task}
  ### Iteration {n}/{max}
  - **Status:** PASS/FAIL
  - **Verify:** `{command}`
  - **Approach:** {subagent's summary of what it did}
  - **Error output:** {if failed, smart-chunked per Section 6.5}
  - **Duration:** {seconds}
  ```
- If raw error output > 500 lines: write full output to `.anvil-logs/{timestamp}-iter{n}.log`, add pointer in journal entry

#### LEARN (on success only)
- Append to `memory/anvil-learnings.md`:
  ```markdown
  ## {task description}
  - **ID:** {unique-id, e.g. anvil-2026-03-22-001}
  - **Date:** {timestamp}
  - **Project:** {project path}
  - **Iterations needed:** {n}
  - **What worked:** {subagent's explanation}
  - **What failed first:** {summary of failed approaches if any}
  - **Verify command:** `{command}`
  ```
- Update `MEMORY.md` index if `anvil-learnings.md` is new
- **Smart mode only:** Embed the learning (task + what worked + what failed) via `nomic-embed-text` and store in ChromaDB with the learning ID as document key

#### DONE
- Report success to user with iteration count and summary
- Mark tasks as completed

#### FAILED
- Report failure to user with summary of all attempts
- Suggest: simplify the task, increase `--max`, or try manually
- Still journals everything (failures are learning data)

---

## 4. Hooks: Thin Detection Layer

### Purpose

Hooks watch for test/build failures during normal Claude Code usage and suggest invoking Anvil. They do NOT run Anvil automatically — they surface a suggestion.

### Hook: `PostToolUse` (Bash detection)

Triggers after any tool execution. The hook receives a **JSON payload on stdin** (not command-line arguments) containing:
- `hook_event_name` — always `"PostToolUse"`
- `tool_name` — e.g., `"Bash"`
- `tool_input` — the arguments sent to the tool (for Bash: `{ "command": "npm test", ... }`)
- `tool_response` — the full output/result of the tool call
- `session_id`, `cwd`, `tool_use_id`

The hook filters for `tool_name === "Bash"`, checks if the command matches known test/build patterns, and inspects `tool_response` for failure indicators (non-zero exit code, error text).

**Detection patterns** (default, configurable in `anvil-config.md`):

```json
{
  "detect_patterns": [
    "npm test", "npm run test", "npx jest", "npx vitest",
    "npm run build", "npx tsc",
    "npm run lint", "npx eslint",
    "pytest", "python -m pytest",
    "cargo build", "cargo test",
    "go build", "go test",
    "make test", "make build"
  ]
}
```

**Behavior when triggered:**
- Hook reads JSON from stdin, filters for Bash tool calls
- Checks if `tool_input.command` matches a known pattern
- Inspects `tool_response` for failure signals (error text, non-zero exit mention)
- If matched failure: outputs suggestion to stderr (exit code 2 surfaces stderr to Claude as context)
  ```
  [Anvil] Detected test failure in: npm test
    Run: /anvil "Fix: npm test failure" --verify "npm test"
  ```
- The user/Claude decides whether to invoke `/anvil` or handle manually
- Hook NEVER auto-invokes the skill

### Hook Implementation

```python
#!/usr/bin/env python3
"""anvil-detect-hook.py — Thin PostToolUse hook that detects test/build failures."""
import json
import sys
import os

DETECT_PATTERNS = [
    "npm test", "npm run test", "npx jest", "npx vitest",
    "npm run build", "npx tsc",
    "npm run lint", "npx eslint",
    "pytest", "python -m pytest",
    "cargo build", "cargo test",
    "go build", "go test",
    "make test", "make build",
]

def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    # Only care about Bash tool calls
    if data.get("tool_name") != "Bash":
        sys.exit(0)

    tool_input = data.get("tool_input", {})
    command = tool_input.get("command", "")
    tool_response = data.get("tool_response", "")

    # Convert tool_response to string for inspection
    response_str = json.dumps(tool_response) if isinstance(tool_response, dict) else str(tool_response)

    # Check if command matches a known pattern
    matched_pattern = None
    for pattern in DETECT_PATTERNS:
        if pattern in command:
            matched_pattern = pattern
            break

    if not matched_pattern:
        sys.exit(0)

    # Check for failure indicators in the response
    failure_indicators = ["error", "fail", "Error", "FAIL", "exit code", "non-zero", "Exception"]
    is_failure = any(indicator in response_str for indicator in failure_indicators)

    if is_failure:
        # Exit code 2 surfaces stderr to Claude as context
        print(f'[Anvil] Detected failure in: {command}', file=sys.stderr)
        print(f'  Run: /anvil "Fix: {matched_pattern} failure" --verify "{command}"', file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
```

### Hook Registration

Installed via CLI into `~/.claude/settings.json` (global) or `.claude/settings.json` (project):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.local/bin/anvil-detect-hook.py"
          }
        ]
      }
    ]
  }
}
```

Note: Uses `matcher: "*"` (wildcard) as is convention in Claude Code hooks. The hook itself filters for `tool_name === "Bash"` internally. This matches existing hook patterns in the Claude Code ecosystem.

---

## 5. CLI: `npx anvil-cc`

### Commands

| Command | Description |
|---------|-------------|
| `npx anvil-cc init` | Register skill + hooks (Lite mode, no extra deps) |
| `npx anvil-cc init --smart` | Lite + install local vector search (Ollama + ChromaDB) |
| `npx anvil-cc init --global` | Register globally (all projects) |
| `npx anvil-cc init --project` | Register for current project only |
| `npx anvil-cc status` | Show install status, mode (Lite/Smart), index stats |
| `npx anvil-cc reindex` | Rebuild vector index from markdown source files |
| `npx anvil-cc uninstall` | Remove skill + hooks from config |

### `init` Flow

1. Detect Claude Code installation (`~/.claude/` exists)
2. Ask: global or project-level install?
3. Create directories if needed (`mkdir -p`):
   - Global: `~/.claude/skills/anvil/`
   - Project: `.claude/commands/`
4. Copy skill file to appropriate location:
   - Global: `~/.claude/skills/anvil/SKILL.md` (cross-project, personal)
   - Project: `.claude/commands/anvil.md` (project-scoped, shareable with team)
5. Copy hook script:
   - `~/.local/bin/anvil-detect-hook.py` (or project-local `.claude/hooks/`)
6. Register hook in settings:
   - Global: `~/.claude/settings.json`
   - Project: `.claude/settings.json`
7. Initialize memory files in Claude Code's native memory directory:
   - `~/.claude/projects/<project-hash>/memory/anvil-journal.md` (empty, with header)
   - `~/.claude/projects/<project-hash>/memory/anvil-learnings.md` (empty, with header)
   - The `<project-hash>` is derived from the project's git root path
8. **If `--smart` flag**: Install vector search dependencies:
   - Check if Ollama is installed; if not, prompt user to install (`brew install ollama` / `curl -fsSL https://ollama.com/install.sh | sh`)
   - Pull embedding model: `ollama pull nomic-embed-text` (~275MB one-time)
   - Install ChromaDB: `pip install chromadb` (local SQLite-backed, no server needed)
   - Initialize empty ChromaDB collection at `~/.anvil/chroma/<project-hash>/`
   - Write `anvil-config.md` with `mode: smart`
9. Print success message with usage examples

### What Gets Installed

**Skill file** (one of):
- Global: `~/.claude/skills/anvil/SKILL.md` — available in all projects
- Project: `.claude/commands/anvil.md` — scoped to this project, committable to git

A markdown file with YAML frontmatter that Claude Code loads as a slash command. Contains the full iteration logic as instructions that Claude Code follows when `/anvil` is invoked. See Section 9.1 for the frontmatter schema.

**Hook script** (`~/.local/bin/anvil-detect-hook.py` or project-local `.claude/hooks/`):
The Python detection script from Section 4.

---

## 6. Memory System

### Two-Tier Architecture

Anvil uses a **tiered memory system** that works without any external dependencies (Lite mode) but can be upgraded to semantic vector search (Smart mode) for projects with large learning histories.

| Tier | What | Storage | Recall Strategy | Dependencies |
|------|------|---------|-----------------|-------------|
| **Lite** (default) | Flat markdown files | Claude Code native memory | Keyword match on task description | None |
| **Smart** (opt-in) | Markdown + local vector index | Markdown (source of truth) + ChromaDB (search index) | Semantic embedding search via nomic-embed-text | Ollama + ChromaDB |

**Key principle:** Markdown is always the source of truth. The vector index is a **search accelerator** — it can be deleted and rebuilt from markdown at any time via `npx anvil-cc reindex`.

### File Structure

Anvil memory lives in Claude Code's **native user-local memory directory**, NOT in the project tree. This prevents sensitive debug output (error traces, stack traces) from being committed to git and follows Claude Code's convention.

```
~/.claude/projects/<project-hash>/memory/    # Claude Code native memory (user-local)
├── MEMORY.md                                # Index (auto-managed by Claude Code)
├── anvil-journal-YYYY-MM.md                 # Monthly iteration logs (append-only, rotated)
├── anvil-learnings.md                       # Distilled problem→solution pairs
└── anvil-config.md                          # Per-project Anvil preferences (incl. mode)

~/.anvil/                                    # Smart mode only (user-local)
├── chroma/<project-hash>/                   # ChromaDB collection per project
│   └── chroma.sqlite3                       # Local SQLite-backed vector store
└── models/                                  # Symlink to Ollama model cache (informational)

project-root/
├── .anvil-state.json                        # Temp: iteration state for crash recovery (gitignored)
├── .anvil-logs/                             # Overflow: verbose error output (gitignored)
├── .claude/
│   ├── commands/
│   │   └── anvil.md                         # The skill (slash command definition) — project install
│   └── settings.json                        # Hook registration (project-level)
└── ...

~/.claude/                                   # Global install alternative
├── skills/
│   └── anvil/
│       └── SKILL.md                         # The skill (slash command definition) — global install
├── settings.json                            # Hook registration (global)
└── ...
```

Note: `<project-hash>` is derived automatically by Claude Code from the project's git root path. Anvil does not need to compute this — it uses Claude Code's native Read/Write/Edit tools which resolve memory paths automatically.

### Smart Mode: Vector Search Detail

**Stack:** Ollama (`nomic-embed-text`, 768-dim) + ChromaDB (local SQLite-backed)
**Cost:** $0 — fully local, no API keys, no cloud
**Model size:** ~275MB one-time download
**Performance:** ~87ms embed, ~79ms full search, ~7ms on cache hit

#### Indexing (on LEARN)
When Anvil saves a learning to `anvil-learnings.md`, it also:
1. Extracts the task description, what worked, and what failed
2. Embeds this text via `nomic-embed-text` (local Ollama)
3. Stores the embedding + metadata (date, file path, verify command) in ChromaDB
4. The markdown entry ID is stored as ChromaDB document ID — linking the two

#### Retrieval (on RECALL)
1. Embed the current task description
2. Query ChromaDB for top 5 nearest neighbors (cosine similarity)
3. Read the matching entries from `anvil-learnings.md` by ID
4. Inject into subagent prompt (max 2000 tokens budget)

#### Rebuild
`npx anvil-cc reindex` parses `anvil-learnings.md`, re-embeds every entry, and rebuilds the ChromaDB collection. Safe to run anytime — the markdown is the source of truth.

#### Fallback
If Ollama or ChromaDB is unavailable at runtime (process not running, model deleted), Anvil automatically falls back to Lite mode keyword matching and logs a warning: `[Anvil] Smart mode unavailable, falling back to keyword recall.`

### memory/anvil-journal-YYYY-MM.md (Monthly Rotation)

Append-only log of every Anvil run, **rotated monthly** to prevent unbounded growth. Full detail within each month, never pruned within a month. Old months remain readable but aren't loaded into context.

Naming: `anvil-journal-2026-03.md`, `anvil-journal-2026-04.md`, etc. Anvil always appends to the current month's file, creating it with headers if it doesn't exist.

```markdown
---
name: Anvil Iteration Journal — 2026-03
description: Complete log of all Anvil iteration runs for March 2026
type: project
---

## Run: 2026-03-22T14:30:00Z | Task: Fix failing auth tests

### Iteration 1/5
- **Status:** FAIL
- **Verify:** `npm test`
- **Approach:** Updated JWT token expiry check in auth.middleware.ts
- **Error:** Expected 200 got 401 on /api/protected endpoint
- **Duration:** 45s

### Iteration 2/5
- **Status:** PASS
- **Verify:** `npm test`
- **Approach:** Fixed token refresh logic — was using expired token from cache instead of refreshing
- **Duration:** 38s

---

## Run: 2026-03-22T16:00:00Z | Task: Fix TypeScript build errors
...
```

### memory/anvil-learnings.md

Distilled solutions. This is what Anvil reads at the RECALL phase to avoid repeating mistakes.

```markdown
---
name: Anvil Learnings
description: Distilled problem-solution pairs from Anvil iterations for cross-session learning
type: project
---

## Fix failing auth tests
- **Date:** 2026-03-22
- **Iterations needed:** 2
- **What worked:** Token refresh logic was using cached expired token. Fixed by checking expiry before using cache.
- **What failed first:** Tried adjusting JWT expiry duration (wrong root cause)
- **Verify:** `npm test`

## Fix TypeScript build errors
- **Date:** 2026-03-22
- **Iterations needed:** 1
- **What worked:** Missing type export in index.ts barrel file
- **Verify:** `npx tsc --noEmit`
```

### memory/anvil-config.md

Optional per-project configuration. Users can customize detection patterns, defaults, and memory mode.

```markdown
---
name: Anvil Configuration
description: Per-project Anvil preferences, detection patterns, and memory mode
type: project
---

## Mode
- **Recall mode:** smart | lite (default: lite)

## Defaults
- **Max iterations:** 5
- **Verify timeout:** 120s
- **Max error output per entry:** 500 lines
- **Subagent prompt token budget:** 4000 tokens (learnings + error context combined)

## Detection Patterns
- `npm test`
- `npm run build`
- `npx tsc`

## Custom Checks
- **deploy-check:** `curl -s -o /dev/null -w "%{http_code}" https://myapp.com/health | grep -q 200`

## Journal
- **Rotation:** monthly (anvil-journal-YYYY-MM.md)
- **Max lines per entry:** 500 (overflow → .anvil-logs/)
```

### Smart Error Chunking

Instead of dumb truncation (first N + last M chars), Anvil uses **rule-based smart chunking** to extract the most useful parts of error output. This is pure string parsing — zero ML dependencies.

#### Chunking Rules by Error Type

| Error Type | Detection | Extraction Rule |
|------------|-----------|----------------|
| **Stack traces** (JS/TS/Python) | Lines matching `at ...` or `File "..."` | Keep only **user code frames** (skip `node_modules/`, `site-packages/`, stdlib). Keep the error message line + top 5 user frames. |
| **Build errors** (tsc, webpack, cargo) | Lines matching `error TS\d+`, `ERROR in`, `error\[E\d+\]` | **Deduplicate** repeated errors (e.g., 50x "Cannot find module X" → one instance + count). Keep unique errors only. |
| **Test failures** (jest, vitest, pytest) | Lines matching `FAIL`, `✕`, `FAILED` | Extract **failing test names + assertion messages**. Skip passing test output entirely. |
| **Lint errors** (eslint, clippy) | Lines matching `\d+:\d+\s+(error\|warning)` | Group by rule, show first instance of each + total count. |
| **Generic/unknown** | No pattern matched | Fallback: first 500 chars + last 1500 chars (original behavior). |

#### Overflow Handling

When raw error output exceeds 500 lines:
1. Apply smart chunking rules above → write **chunked summary** to journal
2. Write **full raw output** to `.anvil-logs/{timestamp}-{iteration}.log` (gitignored)
3. Add pointer in journal: `Full output: .anvil-logs/2026-03-22T14-30-00Z-iter1.log`

This keeps the journal concise while preserving full debugging data locally.

#### Implementation

Smart chunking is implemented as a TypeScript module (`src/utils/smart-chunk.ts`) shipped with the CLI. The skill invokes it via a Bash command:

```bash
# Pipe raw error output through the chunker
echo "$RAW_OUTPUT" | npx anvil-cc chunk --type auto --max-chars 2000
```

The `--type auto` flag auto-detects error type from content. Users can force a type with `--type jest|tsc|eslint|stack|generic`.

---

## 7. Subagent Prompt Design

The subagent prompt is critical — it determines fix quality. Here's the full template:

### First Iteration (No Prior Failure)

```markdown
You are Anvil, an iteration engine forging code fixes.

## Task
{task description}

## Verification
After you make changes, this command will be run to check your work:
`{verify command}`

## Prior Learnings
{if matching learnings found in memory/anvil-learnings.md}
Similar tasks have been solved before in this project:
{relevant learning entries}
{else}
No prior learnings found for this type of task.
{end}

## Instructions
1. Read the relevant code files to understand the problem
2. Make the MINIMAL fix needed — do not refactor unrelated code
3. Do NOT run the verification command yourself
4. After making changes, explain in one paragraph: what you changed and why
```

### Retry Iteration (After Failure)

```markdown
You are Anvil, an iteration engine forging code fixes.
This is attempt {n} of {max}. Previous attempts have failed.

## Task
{task description}

## Verification
`{verify command}`

## Previous Attempt #{n-1} Failed
**What was tried:** {previous subagent's explanation}
**Error output:**
```
{stderr/stdout, smart-chunked — see Section 6.5 for extraction rules; max 2000 chars total}
```

{if n > 2}
## All Previous Attempts
{summary of each prior attempt and its error}
{end}

## Instructions
1. The previous approach DID NOT WORK. Try something DIFFERENT.
2. Read the error output carefully — the answer is usually in there.
3. Make the MINIMAL fix needed.
4. Do NOT run the verification command yourself.
5. Explain what you changed and why it's different from the last attempt.
```

---

## 8. User Experience Flow

### Explicit Invocation

```
User: /anvil "Fix failing tests" --verify "npm test" --max 3

Claude: Starting Anvil iteration engine.
        Task: Fix failing tests
        Verify: npm test
        Max iterations: 3

        Checking past learnings... found 1 relevant entry.

        --- Iteration 1/3 ---
        Dispatching subagent...

        [Subagent completes, reports what it changed]

        Running verification: npm test
        Result: FAILED (exit code 1)
        Error: TypeError: Cannot read property 'id' of undefined at user.test.js:42

        --- Iteration 2/3 ---
        Dispatching subagent with error context...

        [Subagent completes, reports different approach]

        Running verification: npm test
        Result: PASSED

        Anvil completed in 2 iterations.
        Changes: Fixed null check in UserService.getById()
        Journaled to memory/anvil-journal.md
        Learning saved to memory/anvil-learnings.md
```

### Hook-Triggered Suggestion

```
User: [runs some code, then...]
      npm test

Claude: [runs npm test via Bash, it fails]

        [Hook detects failure]
        [Anvil] Detected test failure in: npm test
          Run: /anvil "Fix: npm test failure" --verify "npm test"

User: /anvil "Fix: npm test failure" --verify "npm test"

        [Anvil iteration loop begins...]
```

---

## 9. Package Structure

```
anvil-cc/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE (MIT)
├── src/
│   ├── cli.ts                    # npx anvil-cc entry point
│   ├── commands/
│   │   ├── init.ts               # Install skill + hooks (+ optional --smart deps)
│   │   ├── status.ts             # Check installation, mode, index stats
│   │   ├── reindex.ts            # Rebuild vector index from markdown
│   │   ├── chunk.ts              # Smart error chunking CLI (piped usage)
│   │   └── uninstall.ts          # Remove skill + hooks + vector index
│   ├── templates/
│   │   ├── anvil-skill.md        # The skill file template (slash command)
│   │   ├── anvil-detect-hook.py  # The hook script template (Python)
│   │   ├── anvil-journal.md      # Starter journal file (monthly rotation header)
│   │   ├── anvil-learnings.md    # Starter learnings file
│   │   └── anvil-config.md       # Starter config file (mode: lite|smart)
│   ├── memory/
│   │   ├── lite-recall.ts        # Keyword-based recall from flat markdown
│   │   ├── smart-recall.ts       # Semantic recall via ChromaDB + Ollama
│   │   ├── indexer.ts            # Embed + store learnings in ChromaDB
│   │   └── reindexer.ts          # Full rebuild from markdown source
│   └── utils/
│       ├── claude-config.ts      # Read/write Claude Code settings.json
│       ├── detect-platform.ts    # OS-specific path handling
│       ├── memory-path.ts        # Resolve ~/.claude/projects/<hash>/memory/
│       └── smart-chunk.ts        # Rule-based error output chunking
├── tests/
│   ├── cli.test.ts
│   ├── init.test.ts
│   ├── smart-chunk.test.ts       # Chunking rules for jest/tsc/eslint/stack
│   ├── lite-recall.test.ts       # Keyword matching tests
│   ├── smart-recall.test.ts      # Vector search tests (requires Ollama fixture)
│   └── templates.test.ts
└── docs/
    └── DESIGN.md                 # This document
```

### 9.1 Skill File Frontmatter Schema

The skill file uses YAML frontmatter that Claude Code reads:

```markdown
---
name: anvil
description: Iteration engine that forges code fixes with retry loops, verification, and cross-session learning. Use when tests fail, builds break, or code needs iterative fixing.
argument-hint: "<task>" --verify "<command>" [--max <n>]
disable-model-invocation: true
allowed-tools: Agent, Bash, Read, Write, Edit, Grep, Glob, TaskCreate, TaskUpdate
---
```

Key frontmatter decisions:
- `disable-model-invocation: true` — Anvil should only run when the user explicitly invokes `/anvil`, never auto-triggered by Claude. The hooks suggest it, but the user pulls the trigger.
- `allowed-tools` — Anvil needs Agent (subagents), Bash (verification), and file tools (memory read/write) without permission prompts.

### Key: The Skill File IS the Logic

The most important file is `templates/anvil-skill.md`. This is a Claude Code slash command definition — a markdown file with instructions that Claude Code follows. It contains:

1. The full iteration state machine logic (as instructions)
2. The subagent prompt templates
3. The memory read/write patterns
4. The verification logic
5. Built-in check definitions

When a user runs `/anvil`, Claude Code reads this file and executes the instructions. No TypeScript runtime needed for the iteration logic itself — it runs within Claude Code's existing execution model.

The TypeScript code (`src/`) is ONLY for the CLI installer (`npx anvil-cc init`).

---

## 10. Configuration

### Global Config (`~/.claude/settings.json`)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.local/bin/anvil-detect-hook.py"
          }
        ]
      }
    ]
  }
}
```

Note: The hook receives a JSON payload on stdin (see Section 4 for details). It filters internally for Bash tool calls.

### Project Override (`.claude/settings.json`)

Projects can override or disable hooks:

```json
{
  "hooks": {
    "PostToolUse": []
  }
}
```

### CLAUDE.md Integration

The `init` command can optionally add an Anvil section to the project's `CLAUDE.md`:

```markdown
## Anvil Integration
- Run `/anvil "task" --verify "command"` to auto-fix issues with retry
- Anvil journals all iterations to `memory/anvil-journal.md`
- Past solutions stored in `memory/anvil-learnings.md`
- Hook auto-detects test/build failures and suggests `/anvil`
```

---

## 11. Built-in Checks Detail

Built-in checks resolve to shell commands with smart defaults:

```typescript
const BUILT_IN_CHECKS: Record<string, {
  command: string;
  detect: (projectRoot: string) => boolean;  // auto-detect if applicable
}> = {
  tsc:    { command: "npx tsc --noEmit",           detect: (p) => exists(`${p}/tsconfig.json`) },
  eslint: { command: "npx eslint . --max-warnings 0", detect: (p) => exists(`${p}/.eslintrc*`) },
  jest:   { command: "npx jest --passWithNoTests",  detect: (p) => configHas(p, "jest") },
  vitest: { command: "npx vitest run",              detect: (p) => configHas(p, "vitest") },
  pytest: { command: "python -m pytest",            detect: (p) => exists(`${p}/pytest.ini`) || exists(`${p}/pyproject.toml`) },
  build:  { command: "npm run build",               detect: (p) => packageHasScript(p, "build") },
  cargo:  { command: "cargo build",                 detect: (p) => exists(`${p}/Cargo.toml`) },
  go:     { command: "go build ./...",              detect: (p) => exists(`${p}/go.mod`) },
};
```

When `--verify tsc` is passed, Anvil resolves it to `npx tsc --noEmit`. When no `--verify` is given but Anvil can detect the project type, it suggests an appropriate check.

---

## 12. Reliability Model

The entire iteration state machine runs as markdown instructions that Claude Code follows. This is the intended design but carries risks:

### Risk: Context Compaction Mid-Run

If an Anvil run triggers context compaction (long error outputs, many iterations), Claude Code may lose track of iteration state.

**Mitigations:**
- Write a `.anvil-state.json` temp file in the project root after each iteration with current state (iteration count, task, verify command, accumulated errors). Read it at the start of each iteration cycle. Clean up on DONE/FAILED. On startup, if stale state file found, prompt: "Found interrupted Anvil run. Resume or start fresh?"
- Keep subagent prompts within a **4000 token budget** (learnings + error context combined). Smart chunking (Section 6.5) extracts only relevant error signals instead of raw dumps.
- Cap at 10 max iterations. Beyond that, the context burden outweighs the fix probability.

### Risk: Subagent Makes No Changes

The subagent may "think" about the problem but not actually edit any files.

**Mitigation:** After each subagent returns, run `git diff --stat` to detect changes. If no files changed, log "no-op iteration" and inject a stronger directive on the next attempt: "You MUST make at least one code change."

### Risk: Going in Circles

The subagent may repeat the same failed approach.

**Mitigation:** Track error signatures (first 100 chars of each error output). If the same signature appears 3+ times, halt and escalate to the user: "Anvil is going in circles. The error `{pattern}` has appeared {n} times. Consider simplifying the task or fixing manually."

### Risk: Verification Auto-Detection Ambiguity

When `--verify` is omitted and Anvil auto-detects the project type:

**Mitigation:** Always prompt the user to confirm the detected check before proceeding: "Detected TypeScript project. Use `npx tsc --noEmit` as verification? (Y/n)"

---

## 13. Edge Cases and Error Handling

| Scenario | Behavior |
|----------|----------|
| **Subagent fails to spawn** | Log error, skip to next iteration. After 2 spawn failures, abort and report. |
| **Verification command hangs** | 120s timeout (configurable). Kill process, treat as failure, retry. |
| **Subagent makes no changes** | Detect via `git diff --stat`. If no changes, log "no-op iteration" and prompt subagent to try harder on next iteration. |
| **Same error repeats 3+ times** | Detect repeated error patterns. Escalate to user: "Anvil is going in circles. The error `{pattern}` has appeared {n} times. Consider simplifying the task or fixing manually." |
| **Memory files don't exist** | Create them with headers on first run. No error. |
| **Journal file exceeds 10K lines** | Monthly rotation handles this — each month starts a fresh file. Old months are never loaded into context. |
| **Learnings file has 500+ entries** | Smart mode: semantic search finds relevant entries regardless of count. Lite mode: keyword match with top 5 results. Either way, max 2000 tokens injected. |
| **Error output exceeds 500 lines** | Smart chunking extracts signal (see Section 6.5). Full raw output saved to `.anvil-logs/` for manual inspection. |
| **Smart mode deps unavailable** | Auto-fallback to Lite mode with warning. Markdown is always the source of truth. |
| **Vector index corrupted** | `npx anvil-cc reindex` rebuilds from markdown. No data loss possible. |
| **Stale `.anvil-state.json` found** | Prompt user: "Found interrupted run. Resume or start fresh?" |
| **No git repo** | Anvil still works but can't detect "no changes made." Skip that check. |
| **Verification passes on first try** | Log success, save learning, done. No wasted iterations. |
| **User interrupts mid-iteration** | Claude Code handles Ctrl+C. Journal whatever was completed so far. |

---

## 14. What's NOT in Scope

- **VPS/dashboard sync** — add later as a hook/plugin, not core
- **Multi-agent parallel iterations** — future enhancement; v1 is sequential
- **Custom validator functions** (`.anvil-verify.ts`) — v1 uses shell commands + built-ins only
- **Cost/token tracking** — future enhancement
- **Cross-project learning** — memory is per-project (Claude Code's native scoping). Global learnings via shared vector collections are a future feature.
- **Gemini/Codex compatibility** — v1 targets Claude Code only. Other agents can be added later.
- **Cloud vector databases** — v1 is fully local (ChromaDB SQLite). Milvus/Zilliz Cloud/Pinecone integration is out of scope.
- **Custom embedding models** — v1 uses `nomic-embed-text` only. Model selection is a future feature.
- **ML-based error classification** — smart chunking uses rule-based parsing only. ML classifiers are not needed for v1 error types.

---

## 15. Success Criteria

1. `npx anvil-cc init` installs in under 10 seconds with zero configuration (Lite mode)
2. `npx anvil-cc init --smart` installs vector search deps and initializes index in under 60 seconds
3. `/anvil "Fix tests" --verify "npm test"` runs a complete iteration loop
4. **Lite mode**: keyword recall finds relevant learnings from 50+ entries
5. **Smart mode**: semantic recall finds "Fix JWT refresh" when searching "Fix auth token bug" (different words, same meaning)
6. Smart chunking reduces a 200-line jest failure to ~20 lines of actionable signal
7. Hook correctly detects test/build failures and suggests `/anvil`
8. Journal rotates monthly; no single file exceeds reasonable size
9. `npx anvil-cc reindex` rebuilds vector index from markdown in under 30 seconds for 500 entries
10. Smart mode falls back to Lite gracefully when Ollama/ChromaDB unavailable
11. Works on macOS, Linux, and WSL
12. Lite mode: no runtime dependencies beyond Claude Code and Node.js >=20
13. Smart mode: requires Ollama + ChromaDB (both free, local, no API keys)
