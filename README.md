# Anvil

**Iterative code forging engine for Claude Code.**

In plain English, Anvil takes a coding task like "fix the failing tests", asks Claude Code to make a focused fix, runs your verification command, and keeps retrying with the latest error output until the check passes or it reaches the retry limit.

Anvil automates the fix-verify-retry loop. When tests fail or builds break, instead of manually fixing, re-running, reading errors, and fixing again — Anvil does that loop for you, learning from every attempt.

```
/anvil "Fix failing tests" --verify "npm test" --max 5
```

Anvil dispatches a subagent to fix the code, runs your verification command, and if it fails, passes the error context to the next attempt with instructions to try something different. It journals every iteration and saves what worked for future sessions.

## How It Works

```
You run /anvil ──► RECALL past learnings ──► DISPATCH subagent to fix
                                                      │
                          ┌───────────────────────────┘
                          ▼
                   VERIFY (run your command)
                          │
                    ┌─────┴─────┐
                    │           │
                  PASS        FAIL
                    │           │
              LEARN + DONE    RETRY with error context
                              (up to --max iterations)
```

**Key features:**
- Learns across sessions — past solutions are recalled for similar problems
- Smart error chunking — extracts signal from noise (stack traces, build errors, test failures)
- Monthly journal rotation — full iteration history, never pruned
- Circle detection — halts if the same error appears 3+ times
- Crash recovery — resumes interrupted runs from where they left off
- Zero runtime dependencies — works with Claude Code alone

## Quick Start

### Install

```bash
# Install globally from GitHub
npm install -g github:abdullah1854/Anvil --install-prefix=./anvil-cc

# Or clone and link
git clone https://github.com/abdullah1854/Anvil.git
cd Anvil/anvil-cc
npm install && npm run build && npm link
```

Then in your project:

```bash
cd your-project
anvil-cc init
```

This installs:
- The `/anvil` slash command into your Claude Code config
- A detection hook that suggests `/anvil` when tests/builds fail

### Use

Inside Claude Code:

```bash
# Fix failing tests
/anvil "Fix failing tests" --verify "npm test"

# Fix TypeScript errors
/anvil "Fix TypeScript errors" --verify tsc

# Fix lint issues with more attempts
/anvil "Fix ESLint errors" --verify eslint --max 10

# Fix with any custom command
/anvil "Fix the login bug" --verify "curl -s localhost:3000/health | grep ok"
```

### Built-in Checks

Instead of writing shell commands, use shorthand names:

| Name | Resolves To |
|------|------------|
| `tsc` | `npx tsc --noEmit` |
| `eslint` | `npx eslint . --max-warnings 0` |
| `jest` | `npx jest --passWithNoTests` |
| `vitest` | `npx vitest run` |
| `pytest` | `python -m pytest` |
| `build` | `npm run build` |
| `cargo` | `cargo build` |
| `go` | `go build ./...` |

## CLI Commands

```bash
anvil-cc init                    # Install skill + hook (Lite mode)
anvil-cc init --smart            # Install with vector search (Ollama + ChromaDB)
anvil-cc init --global           # Install for all projects
anvil-cc status                  # Show install status, mode, learning count
anvil-cc reindex                 # Rebuild vector index from markdown
anvil-cc chunk                   # Smart error chunking (piped stdin)
anvil-cc uninstall               # Remove skill + hook
```

## Smart Error Chunking

Anvil doesn't just truncate error output — it extracts the useful parts:

| Error Type | What Anvil Extracts |
|------------|-------------------|
| **Stack traces** | Error message + user code frames only (skips node_modules) |
| **TypeScript** | Unique errors, deduplicated (50x "Cannot find name 'foo'" → 1 instance + count) |
| **Test failures** | Failing test names + assertion messages (skips passing tests) |
| **Lint errors** | Grouped by rule, first instance + count |
| **Generic** | Head + tail with truncation marker |

You can also use it standalone:

```bash
npm test 2>&1 | anvil-cc chunk --max-chars 2000
```

## Memory System

Anvil uses two tiers of memory:

### Lite Mode (default, zero dependencies)

- **Journal** (`anvil-journal-YYYY-MM.md`) — append-only log of every iteration, rotated monthly
- **Learnings** (`anvil-learnings.md`) — distilled problem/solution pairs
- **Recall** — keyword matching on task description

### Smart Mode (opt-in, local vector search)

```bash
anvil-cc init --smart
```

Adds semantic search via local embeddings:
- **Ollama** with `nomic-embed-text` (~275MB model, runs locally)
- **ChromaDB** (SQLite-backed, no server needed)
- Finds "Fix JWT refresh" when you search "Fix auth token bug" (different words, same meaning)
- Markdown remains the source of truth — vector index can be rebuilt anytime

## Hook: Automatic Failure Detection

After installation, Anvil watches for test/build failures during normal Claude Code usage:

```
Claude: [runs npm test via Bash, it fails]

[Anvil] Detected test failure in: npm test
  Run: /anvil "Fix: npm test failure" --verify "npm test"
```

The hook **suggests** — it never auto-runs. You decide whether to invoke `/anvil`.

Detected patterns: `npm test`, `npx tsc`, `npm run build`, `pytest`, `cargo build`, `go test`, and more.

## How Anvil Learns

When Anvil successfully fixes something, it saves a learning:

```markdown
## Fix failing auth tests
- **ID:** anvil-2026-03-22-001
- **Iterations needed:** 2
- **What worked:** Token refresh logic was using cached expired token
- **What failed first:** Tried adjusting JWT expiry duration
- **Verify:** `npm test`
```

Next time a similar issue appears, Anvil recalls this and injects it into the subagent's prompt — so it tries the approach that worked before, not the one that failed.

## Architecture

Anvil has three components:

| Component | What It Does | Where It Lives |
|-----------|-------------|---------------|
| **Skill** (`/anvil`) | Iteration state machine, subagent dispatch, memory management | `.claude/commands/anvil.md` or `~/.claude/skills/anvil/` |
| **Hook** | Detects test/build failures, suggests `/anvil` | `~/.local/bin/anvil-detect-hook.py` |
| **CLI** (`anvil-cc`) | One-time setup, chunking utility, index management | npm package |

The skill file is the core — it's a markdown file with instructions that Claude Code follows. No TypeScript runtime needed for the iteration logic. The CLI is only for installation and utilities.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (any version with skill support)
- Node.js >= 20
- Python 3 (for the detection hook)
- **Smart mode only:** [Ollama](https://ollama.com/) + `pip install chromadb`

## Configuration

After install, Anvil creates a config in Claude Code's memory directory:

```markdown
## Mode
- **Recall mode:** lite

## Defaults
- **Max iterations:** 5
- **Verify timeout:** 120s
- **Max error output per entry:** 500 lines
- **Subagent prompt token budget:** 4000 tokens
```

Edit this file to customize defaults for your project.

## Reliability

Anvil handles edge cases:

- **Subagent makes no changes** — detects via `git diff`, prompts harder on retry
- **Going in circles** — tracks error signatures, halts after 3 identical errors
- **Context compaction** — persists state to `.anvil-state.json` for crash recovery
- **Stale state file** — prompts "Resume or start fresh?" on next run
- **Large error output** — smart chunking + overflow to `.anvil-logs/` directory
- **No git repo** — still works, just can't detect no-op iterations

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR process.

## License

[MIT](LICENSE)
