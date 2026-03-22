# Anvil-CC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `anvil-cc`, a Claude Code native iteration engine that auto-fixes code with retry loops, smart error chunking, cross-session learning, and optional local vector search.

**Architecture:** A TypeScript CLI (`npx anvil-cc`) that installs a Claude Code skill file (`/anvil` slash command) + a Python detection hook into the user's Claude Code config. The skill file contains the full iteration logic as markdown instructions. The CLI also ships smart error chunking and optional vector search (Ollama + ChromaDB) for semantic recall of past learnings.

**Tech Stack:** TypeScript (CLI + utils), Node.js >=20, Python 3 (hook script), ChromaDB + Ollama (optional Smart mode)

**Spec:** `2026-03-22-anvil-design.md` (in project root)

---

## File Structure

```
anvil-cc/
├── package.json                          # npm package config, bin entry
├── tsconfig.json                         # TypeScript config
├── .gitignore                            # node_modules, dist, .anvil-logs, etc.
├── src/
│   ├── cli.ts                            # Entry point: arg parsing, command dispatch
│   ├── commands/
│   │   ├── init.ts                       # Install skill + hooks + optional smart deps
│   │   ├── status.ts                     # Show install status, mode, index stats
│   │   ├── reindex.ts                    # Rebuild vector index from markdown
│   │   ├── chunk.ts                      # Smart error chunking CLI (piped usage)
│   │   └── uninstall.ts                  # Remove skill + hooks + vector index
│   ├── memory/
│   │   ├── lite-recall.ts                # Keyword-based recall from flat markdown
│   │   ├── smart-recall.ts              # Semantic recall via ChromaDB + Ollama
│   │   ├── indexer.ts                    # Embed + store learnings in ChromaDB
│   │   └── reindexer.ts                 # Full rebuild from markdown source
│   ├── utils/
│   │   ├── claude-config.ts              # Read/write Claude Code settings.json
│   │   ├── detect-platform.ts            # OS-specific path handling
│   │   ├── memory-path.ts               # Resolve ~/.claude/projects/<hash>/memory/
│   │   └── smart-chunk.ts               # Rule-based error output chunking
│   └── templates/
│       ├── anvil-skill.md                # The skill file (slash command definition)
│       ├── anvil-detect-hook.py          # The Python hook script
│       ├── anvil-journal.md              # Starter journal file header
│       ├── anvil-learnings.md            # Starter learnings file header
│       └── anvil-config.md               # Starter config file
├── tests/
│   ├── smart-chunk.test.ts               # Chunking rules for jest/tsc/eslint/stack
│   ├── lite-recall.test.ts               # Keyword matching tests
│   ├── claude-config.test.ts             # Settings.json read/write tests
│   ├── cli.test.ts                       # CLI arg parsing tests
│   └── init.test.ts                      # Init command tests (mocked filesystem)
└── dist/                                 # Compiled output (gitignored)
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `anvil-cc/package.json`
- Create: `anvil-cc/tsconfig.json`
- Create: `anvil-cc/.gitignore`
- Create: `anvil-cc/src/cli.ts`

- [ ] **Step 1: Initialize the project directory**

```bash
cd "/Users/abdullah/Documents/Abdullah Pers Projects/Jarvis"
mkdir -p anvil-cc/src/{commands,memory,utils,templates} anvil-cc/tests
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "anvil-cc",
  "version": "0.1.0",
  "description": "Iterative code forging engine for Claude Code — auto-fixes with retry loops, smart chunking, and cross-session learning",
  "type": "module",
  "bin": {
    "anvil-cc": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc && cp -r src/templates dist/templates",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "files": [
    "dist/**/*",
    "src/templates/**/*"
  ],
  "keywords": ["claude-code", "iteration", "auto-fix", "tdd", "testing"],
  "license": "MIT",
  "engines": {
    "node": ">=20"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
.anvil-logs/
.anvil-state.json
*.tsbuildinfo
```

- [ ] **Step 5: Create minimal CLI entry point**

Create `anvil-cc/src/cli.ts`:

```typescript
#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];

const COMMANDS = ["init", "status", "reindex", "chunk", "uninstall"] as const;
type Command = (typeof COMMANDS)[number];

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  if (!COMMANDS.includes(command as Command)) {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  const mod = await import(`./commands/${command}.js`);
  await mod.default(args.slice(1));
}

function printUsage(): void {
  console.log(`
anvil-cc — Iterative code forging engine for Claude Code

Usage:
  anvil-cc init [--smart] [--global|--project]   Install skill + hooks
  anvil-cc status                                 Show install status
  anvil-cc reindex                                Rebuild vector index
  anvil-cc chunk [--type auto|jest|tsc|eslint]    Smart error chunking (piped)
  anvil-cc uninstall                              Remove skill + hooks
  `.trim());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Install dependencies and verify build**

```bash
cd anvil-cc && npm install && npx tsc --noEmit
```

Expected: Clean install, no TypeScript errors (will fail on missing command imports — that's expected at this stage, we'll stub them next).

- [ ] **Step 7: Create command stubs so CLI compiles**

Create stub files for each command in `src/commands/` that export a default async function:

```typescript
// src/commands/init.ts, status.ts, reindex.ts, chunk.ts, uninstall.ts
export default async function (args: string[]): Promise<void> {
  console.log("Not implemented yet");
}
```

- [ ] **Step 8: Verify build succeeds**

```bash
cd anvil-cc && npx tsc
```

Expected: Clean compilation, `dist/` directory created with `.js` files.

- [ ] **Step 9: Commit**

```bash
git add anvil-cc/package.json anvil-cc/tsconfig.json anvil-cc/.gitignore anvil-cc/src/
git commit -m "feat: scaffold anvil-cc project with CLI entry point and command stubs"
```

---

## Task 2: Platform Utilities

**Files:**
- Create: `anvil-cc/src/utils/detect-platform.ts`
- Create: `anvil-cc/src/utils/memory-path.ts`
- Create: `anvil-cc/src/utils/claude-config.ts`
- Create: `anvil-cc/tests/claude-config.test.ts`

- [ ] **Step 1: Write tests for claude-config**

Create `anvil-cc/tests/claude-config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readSettings, mergeHook } from "../src/utils/claude-config.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("claude-config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `anvil-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads empty settings when file does not exist", () => {
    const settings = readSettings(join(tmpDir, "settings.json"));
    expect(settings).toEqual({});
  });

  it("reads existing settings", () => {
    const path = join(tmpDir, "settings.json");
    writeFileSync(path, JSON.stringify({ hooks: {} }));
    const settings = readSettings(path);
    expect(settings).toEqual({ hooks: {} });
  });

  it("merges a hook into empty settings", () => {
    const result = mergeHook({}, {
      event: "PostToolUse",
      matcher: "*",
      hook: { type: "command", command: "python3 anvil-detect-hook.py" },
    });
    expect(result.hooks.PostToolUse).toHaveLength(1);
    expect(result.hooks.PostToolUse[0].matcher).toBe("*");
  });

  it("does not duplicate an existing hook", () => {
    const existing = {
      hooks: {
        PostToolUse: [{
          matcher: "*",
          hooks: [{ type: "command", command: "python3 anvil-detect-hook.py" }],
        }],
      },
    };
    const result = mergeHook(existing, {
      event: "PostToolUse",
      matcher: "*",
      hook: { type: "command", command: "python3 anvil-detect-hook.py" },
    });
    expect(result.hooks.PostToolUse).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd anvil-cc && npx vitest run tests/claude-config.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement detect-platform.ts**

```typescript
import { statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

export function getClaudeDir(): string {
  return join(homedir(), ".claude");
}

export function getGlobalSettingsPath(): string {
  return join(getClaudeDir(), "settings.json");
}

export function getGlobalSkillDir(): string {
  return join(getClaudeDir(), "skills", "anvil");
}

export function getProjectSettingsPath(projectRoot: string): string {
  return join(projectRoot, ".claude", "settings.json");
}

export function getProjectCommandDir(projectRoot: string): string {
  return join(projectRoot, ".claude", "commands");
}

export function getAnvilDataDir(): string {
  return join(homedir(), ".anvil");
}

export function getHookInstallPath(): string {
  const home = homedir();
  if (platform() === "win32") {
    return join(home, "AppData", "Local", "anvil", "anvil-detect-hook.py");
  }
  return join(home, ".local", "bin", "anvil-detect-hook.py");
}

export function isClaudeInstalled(): boolean {
  try {
    statSync(getClaudeDir());
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Implement memory-path.ts**

```typescript
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export function getProjectHash(projectRoot: string): string {
  return createHash("sha256").update(projectRoot).digest("hex").slice(0, 16);
}

export function getMemoryDir(projectRoot: string): string {
  const hash = getProjectHash(projectRoot);
  return join(homedir(), ".claude", "projects", hash, "memory");
}

export function getChromaDir(projectRoot: string): string {
  const hash = getProjectHash(projectRoot);
  return join(homedir(), ".anvil", "chroma", hash);
}

export function getJournalPath(projectRoot: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return join(getMemoryDir(projectRoot), `anvil-journal-${yyyy}-${mm}.md`);
}

export function getLearningsPath(projectRoot: string): string {
  return join(getMemoryDir(projectRoot), "anvil-learnings.md");
}

export function getConfigPath(projectRoot: string): string {
  return join(getMemoryDir(projectRoot), "anvil-config.md");
}
```

- [ ] **Step 5: Implement claude-config.ts**

```typescript
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface HookEntry {
  type: string;
  command: string;
}

export interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

export interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

export interface MergeHookInput {
  event: string;
  matcher: string;
  hook: HookEntry;
}

export function readSettings(path: string): ClaudeSettings {
  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export function writeSettings(path: string, settings: ClaudeSettings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
}

export function mergeHook(
  settings: ClaudeSettings,
  input: MergeHookInput
): ClaudeSettings {
  const result = { ...settings };
  if (!result.hooks) result.hooks = {};
  if (!result.hooks[input.event]) result.hooks[input.event] = [];

  const existing = result.hooks[input.event].find(
    (m) =>
      m.matcher === input.matcher &&
      m.hooks.some((h) => h.command === input.hook.command)
  );

  if (!existing) {
    result.hooks[input.event].push({
      matcher: input.matcher,
      hooks: [input.hook],
    });
  }

  return result;
}

export function removeHook(
  settings: ClaudeSettings,
  commandSubstring: string
): ClaudeSettings {
  const result = { ...settings };
  if (!result.hooks) return result;

  for (const event of Object.keys(result.hooks)) {
    result.hooks[event] = result.hooks[event]
      .map((m) => ({
        ...m,
        hooks: m.hooks.filter((h) => !h.command.includes(commandSubstring)),
      }))
      .filter((m) => m.hooks.length > 0);

    if (result.hooks[event].length === 0) {
      delete result.hooks[event];
    }
  }

  return result;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd anvil-cc && npx vitest run tests/claude-config.test.ts
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add anvil-cc/src/utils/ anvil-cc/tests/claude-config.test.ts
git commit -m "feat: add platform utilities — claude config, memory paths, platform detection"
```

---

## Task 3: Smart Error Chunking

**Files:**
- Create: `anvil-cc/src/utils/smart-chunk.ts`
- Create: `anvil-cc/tests/smart-chunk.test.ts`
- Modify: `anvil-cc/src/commands/chunk.ts`

- [ ] **Step 1: Write chunking tests**

Create `anvil-cc/tests/smart-chunk.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { smartChunk, detectErrorType } from "../src/utils/smart-chunk.js";

describe("detectErrorType", () => {
  it("detects jest/vitest test failures", () => {
    const output = `FAIL src/auth.test.ts
  ● login > should validate token
    expect(received).toBe(expected)
    Expected: 200
    Received: 401`;
    expect(detectErrorType(output)).toBe("test");
  });

  it("detects TypeScript compilation errors", () => {
    const output = `src/index.ts(12,5): error TS2304: Cannot find name 'foo'.
src/index.ts(15,3): error TS2304: Cannot find name 'bar'.`;
    expect(detectErrorType(output)).toBe("tsc");
  });

  it("detects stack traces", () => {
    const output = `TypeError: Cannot read property 'id' of undefined
    at UserService.getById (src/user.ts:42:10)
    at node_modules/express/lib/router.js:123:5`;
    expect(detectErrorType(output)).toBe("stack");
  });

  it("detects eslint errors", () => {
    const output = `src/index.ts
  12:5  error  Unexpected any  @typescript-eslint/no-explicit-any
  15:3  error  Missing return type  @typescript-eslint/explicit-function-return-type`;
    expect(detectErrorType(output)).toBe("lint");
  });

  it("falls back to generic", () => {
    expect(detectErrorType("something went wrong")).toBe("generic");
  });
});

describe("smartChunk", () => {
  it("extracts only user frames from stack traces", () => {
    const output = `TypeError: Cannot read property 'id' of undefined
    at UserService.getById (src/user.ts:42:10)
    at processRequest (src/handler.ts:18:5)
    at Layer.handle (node_modules/express/lib/router/layer.js:95:5)
    at next (node_modules/express/lib/router/route.js:144:13)
    at Object.<anonymous> (node_modules/express/lib/router/index.js:284:7)`;
    const result = smartChunk(output, 2000);
    expect(result).toContain("src/user.ts:42");
    expect(result).toContain("src/handler.ts:18");
    expect(result).not.toContain("node_modules");
  });

  it("deduplicates repeated tsc errors", () => {
    const lines = Array.from({ length: 50 }, (_, i) =>
      `src/file${i}.ts(1,1): error TS2304: Cannot find name 'foo'.`
    ).join("\n");
    const result = smartChunk(lines, 2000);
    expect(result).toContain("Cannot find name 'foo'");
    expect(result).toContain("50 occurrences");
    expect(result.length).toBeLessThan(lines.length);
  });

  it("extracts failing test names and assertions", () => {
    const output = `PASS src/utils.test.ts
FAIL src/auth.test.ts
  ● login > should validate token
    expect(received).toBe(expected)
    Expected: 200
    Received: 401
  ● login > should refresh expired token
    Error: Token expired
PASS src/db.test.ts`;
    const result = smartChunk(output, 2000);
    expect(result).toContain("should validate token");
    expect(result).toContain("should refresh expired token");
    expect(result).not.toContain("PASS");
  });

  it("respects maxChars limit", () => {
    const longOutput = "x".repeat(5000);
    const result = smartChunk(longOutput, 500);
    expect(result.length).toBeLessThanOrEqual(550); // small buffer for truncation markers
  });

  it("falls back to head+tail for generic errors", () => {
    const output = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const result = smartChunk(output, 200);
    expect(result).toContain("line 0");
    expect(result).toContain("line 99");
    expect(result).toContain("... truncated");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd anvil-cc && npx vitest run tests/smart-chunk.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement smart-chunk.ts**

Create `anvil-cc/src/utils/smart-chunk.ts`:

```typescript
export type ErrorType = "test" | "tsc" | "stack" | "lint" | "generic";

export function detectErrorType(output: string): ErrorType {
  // Test failures (jest, vitest, pytest)
  if (/^FAIL\s/m.test(output) || /●\s/.test(output) || /✕\s/.test(output) || /FAILED\s/m.test(output)) {
    return "test";
  }
  // TypeScript compilation errors
  if (/error TS\d+/.test(output)) {
    return "tsc";
  }
  // ESLint / lint errors
  if (/\d+:\d+\s+(error|warning)\s+/.test(output)) {
    return "lint";
  }
  // Stack traces (JS/TS/Python)
  if (/^\s+at\s+/m.test(output) || /File ".*", line \d+/m.test(output)) {
    return "stack";
  }
  return "generic";
}

export function smartChunk(output: string, maxChars: number): string {
  const type = detectErrorType(output);

  switch (type) {
    case "stack":
      return chunkStack(output, maxChars);
    case "tsc":
      return chunkTsc(output, maxChars);
    case "test":
      return chunkTest(output, maxChars);
    case "lint":
      return chunkLint(output, maxChars);
    default:
      return chunkGeneric(output, maxChars);
  }
}

function chunkStack(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const errorLine = lines.find(
    (l) => /Error:|TypeError:|ReferenceError:|SyntaxError:/.test(l)
  );
  const userFrames = lines.filter(
    (l) =>
      /^\s+at\s+/.test(l) &&
      !l.includes("node_modules") &&
      !l.includes("internal/") &&
      !l.includes("site-packages")
  );

  const parts: string[] = [];
  if (errorLine) parts.push(errorLine.trim());
  parts.push(...userFrames.slice(0, 5).map((l) => l.trim()));

  const result = parts.join("\n");
  return result.length <= maxChars ? result : truncate(result, maxChars);
}

function chunkTsc(output: string, maxChars: number): string {
  const lines = output.split("\n").filter((l) => /error TS\d+/.test(l));

  // Group by error code + message
  const groups = new Map<string, string[]>();
  for (const line of lines) {
    const match = line.match(/error (TS\d+: .+)$/);
    if (match) {
      const key = match[1];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(line);
    }
  }

  const parts: string[] = [];
  for (const [msg, occurrences] of groups) {
    if (occurrences.length === 1) {
      parts.push(occurrences[0]);
    } else {
      parts.push(`${occurrences[0]} (${occurrences.length} occurrences)`);
    }
  }

  const result = parts.join("\n");
  return result.length <= maxChars ? result : truncate(result, maxChars);
}

function chunkTest(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const parts: string[] = [];
  let inFailBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Start of FAIL file block
    if (/^FAIL\s/.test(line)) {
      parts.push(line);
      inFailBlock = true;
      continue;
    }
    // Start of PASS block — skip
    if (/^PASS\s/.test(line)) {
      inFailBlock = false;
      continue;
    }
    // Inside fail block — keep test names and assertions
    if (inFailBlock) {
      if (/^\s+●\s/.test(line) || /^\s+✕\s/.test(line)) {
        parts.push(line);
      } else if (/expect|assert|Error:|Expected:|Received:/i.test(line)) {
        parts.push(line);
      }
    }
  }

  const result = parts.join("\n");
  return result.length <= maxChars ? result : truncate(result, maxChars);
}

function chunkLint(output: string, maxChars: number): string {
  const lines = output.split("\n");

  // Group by rule
  const groups = new Map<string, { first: string; count: number }>();
  for (const line of lines) {
    const match = line.match(/\d+:\d+\s+(error|warning)\s+(.+?)\s+(\S+)$/);
    if (match) {
      const rule = match[3];
      if (!groups.has(rule)) {
        groups.set(rule, { first: line.trim(), count: 0 });
      }
      groups.get(rule)!.count++;
    }
  }

  const parts: string[] = [];
  for (const [rule, { first, count }] of groups) {
    if (count === 1) {
      parts.push(first);
    } else {
      parts.push(`${first} (${count} total)`);
    }
  }

  const result = parts.join("\n");
  return result.length <= maxChars ? result : truncate(result, maxChars);
}

function chunkGeneric(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;
  return truncate(output, maxChars);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const headSize = Math.floor(maxChars * 0.25);
  const tailSize = Math.floor(maxChars * 0.65);
  const marker = "\n\n... truncated ...\n\n";
  return text.slice(0, headSize) + marker + text.slice(-tailSize);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd anvil-cc && npx vitest run tests/smart-chunk.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Wire up the chunk CLI command**

Update `anvil-cc/src/commands/chunk.ts`:

```typescript
import { smartChunk } from "../utils/smart-chunk.js";

export default async function (args: string[]): Promise<void> {
  const typeFlag = args.indexOf("--type");
  const maxFlag = args.indexOf("--max-chars");

  const maxChars = maxFlag !== -1 ? parseInt(args[maxFlag + 1], 10) : 2000;

  // Read stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString("utf-8");

  if (!input.trim()) {
    process.exit(0);
  }

  const result = smartChunk(input, maxChars);
  process.stdout.write(result);
}
```

- [ ] **Step 6: Build and test CLI chunk command**

```bash
cd anvil-cc && npm run build && echo "error TS2304: Cannot find name 'foo'." | node dist/cli.js chunk
```

Expected: Outputs the chunked error.

- [ ] **Step 7: Commit**

```bash
git add anvil-cc/src/utils/smart-chunk.ts anvil-cc/src/commands/chunk.ts anvil-cc/tests/smart-chunk.test.ts
git commit -m "feat: add smart error chunking with type detection (stack/tsc/test/lint/generic)"
```

---

## Task 4: Lite Recall (Keyword-Based)

**Files:**
- Create: `anvil-cc/src/memory/lite-recall.ts`
- Create: `anvil-cc/tests/lite-recall.test.ts`

- [ ] **Step 1: Write tests for lite recall**

Create `anvil-cc/tests/lite-recall.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseLearnings, keywordRecall } from "../src/memory/lite-recall.js";

const SAMPLE_LEARNINGS = `---
name: Anvil Learnings
description: Distilled problem-solution pairs
type: project
---

## Fix failing auth tests
- **ID:** anvil-2026-03-22-001
- **Date:** 2026-03-22
- **Iterations needed:** 2
- **What worked:** Token refresh logic was using cached expired token.
- **What failed first:** Tried adjusting JWT expiry duration
- **Verify command:** \`npm test\`

## Fix TypeScript build errors
- **ID:** anvil-2026-03-22-002
- **Date:** 2026-03-22
- **Iterations needed:** 1
- **What worked:** Missing type export in index.ts barrel file
- **What failed first:** None
- **Verify command:** \`npx tsc --noEmit\`

## Fix database connection timeout
- **ID:** anvil-2026-03-23-001
- **Date:** 2026-03-23
- **Iterations needed:** 3
- **What worked:** Connection pool was exhausted. Increased pool size and added cleanup.
- **What failed first:** Tried increasing timeout, then tried retry logic
- **Verify command:** \`npm test\`
`;

describe("parseLearnings", () => {
  it("parses markdown into structured entries", () => {
    const entries = parseLearnings(SAMPLE_LEARNINGS);
    expect(entries).toHaveLength(3);
    expect(entries[0].title).toBe("Fix failing auth tests");
    expect(entries[0].id).toBe("anvil-2026-03-22-001");
    expect(entries[0].whatWorked).toContain("Token refresh");
  });
});

describe("keywordRecall", () => {
  it("finds entries matching keywords", () => {
    const entries = parseLearnings(SAMPLE_LEARNINGS);
    const results = keywordRecall(entries, "auth token test", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe("Fix failing auth tests");
  });

  it("returns empty for no matches", () => {
    const entries = parseLearnings(SAMPLE_LEARNINGS);
    const results = keywordRecall(entries, "kubernetes deployment yaml", 5);
    expect(results).toHaveLength(0);
  });

  it("respects max results", () => {
    const entries = parseLearnings(SAMPLE_LEARNINGS);
    const results = keywordRecall(entries, "fix", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd anvil-cc && npx vitest run tests/lite-recall.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement lite-recall.ts**

Create `anvil-cc/src/memory/lite-recall.ts`:

```typescript
export interface LearningEntry {
  title: string;
  id: string;
  date: string;
  iterationsNeeded: number;
  whatWorked: string;
  whatFailed: string;
  verifyCommand: string;
  raw: string;
}

export function parseLearnings(markdown: string): LearningEntry[] {
  const entries: LearningEntry[] = [];
  // Split by ## headers (skip frontmatter)
  const sections = markdown.split(/^## /m).slice(1);

  for (const section of sections) {
    const lines = section.split("\n");
    const title = lines[0].trim();
    const raw = `## ${section.trim()}`;

    const getField = (name: string): string => {
      const line = lines.find((l) => l.includes(`**${name}:**`));
      if (!line) return "";
      return line.replace(/.*\*\*.*?\*\*\s*/, "").trim().replace(/^`|`$/g, "");
    };

    entries.push({
      title,
      id: getField("ID"),
      date: getField("Date"),
      iterationsNeeded: parseInt(getField("Iterations needed"), 10) || 0,
      whatWorked: getField("What worked"),
      whatFailed: getField("What failed first"),
      verifyCommand: getField("Verify command"),
      raw,
    });
  }

  return entries;
}

export function keywordRecall(
  entries: LearningEntry[],
  query: string,
  maxResults: number
): LearningEntry[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scored = entries
    .map((entry) => {
      const entryText = `${entry.title} ${entry.whatWorked} ${entry.whatFailed}`.toLowerCase();
      const entryTokens = new Set(tokenize(entryText));

      let score = 0;
      for (const qt of queryTokens) {
        for (const et of entryTokens) {
          if (et.includes(qt) || qt.includes(et)) {
            score++;
          }
        }
      }

      return { entry, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored.map((s) => s.entry);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd anvil-cc && npx vitest run tests/lite-recall.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add anvil-cc/src/memory/lite-recall.ts anvil-cc/tests/lite-recall.test.ts
git commit -m "feat: add lite recall — keyword-based learning retrieval from markdown"
```

---

## Task 5: Template Files

**Files:**
- Create: `anvil-cc/src/templates/anvil-skill.md`
- Create: `anvil-cc/src/templates/anvil-detect-hook.py`
- Create: `anvil-cc/src/templates/anvil-journal.md`
- Create: `anvil-cc/src/templates/anvil-learnings.md`
- Create: `anvil-cc/src/templates/anvil-config.md`

- [ ] **Step 1: Create the skill file template**

Create `anvil-cc/src/templates/anvil-skill.md`. This is the **core of Anvil** — the slash command that Claude Code executes. It contains the full iteration state machine as markdown instructions.

The skill file content is long (~300 lines). It must include:
- YAML frontmatter with `name: anvil`, `description`, `argument-hint`, `disable-model-invocation: true`, `allowed-tools`
- Argument parsing instructions (task, --verify, --max)
- Built-in check resolution table (tsc, eslint, jest, vitest, pytest, build, cargo, go)
- State machine: INIT → RECALL → DISPATCH → VERIFY → JOURNAL/LEARN → DONE/RETRY/FAILED
- Subagent prompt templates (first iteration + retry)
- Memory read/write instructions (journal rotation, learning with ID, config read)
- Smart chunking invocation (pipe error through `npx anvil-cc chunk`)
- `.anvil-state.json` crash recovery (write after each iteration, clean up on done/fail)
- `git diff --stat` no-op detection
- Error signature tracking for circle detection (3+ same error → escalate)
- Stale state file detection on startup

```markdown
---
name: anvil
description: Iteration engine that forges code fixes with retry loops, verification, and cross-session learning. Use when tests fail, builds break, or code needs iterative fixing.
argument-hint: "<task>" --verify "<command>" [--max <n>]
disable-model-invocation: true
allowed-tools: Agent, Bash, Read, Write, Edit, Grep, Glob, TaskCreate, TaskUpdate
---

You are Anvil, an iterative code forging engine. You receive a task, dispatch subagents to fix it, verify the fix, and retry with error context until it passes or you hit the max iterations. You journal every attempt and save learnings for future sessions.

## Argument Parsing

Parse the user's input after `/anvil`:
- First quoted string or unquoted words = **task description**
- `--verify <command>` or `--verify "<command>"` = verification command (optional)
- `--max <n>` = max iterations (default: 5, hard cap: 10)

### Built-in Check Resolution

If `--verify` matches a built-in name, resolve to the shell command:

| Name | Shell Command |
|------|--------------|
| `tsc` | `npx tsc --noEmit` |
| `eslint` | `npx eslint . --max-warnings 0` |
| `jest` | `npx jest --passWithNoTests` |
| `vitest` | `npx vitest run` |
| `pytest` | `python -m pytest` |
| `build` | `npm run build` |
| `cargo` | `cargo build` |
| `go` | `go build ./...` |

If no `--verify` provided, ask the user: "No verification command specified. What command should I run to check if the fix works?"

## State Machine

Execute these states in order:

### INIT

1. Parse arguments as described above
2. Check for stale `.anvil-state.json` in the project root. If found, ask: "Found interrupted Anvil run ({task}). Resume from iteration {n} or start fresh?" If resume, load state and skip to DISPATCH. If fresh, delete the file.
3. Create a task list showing the plan:
   - Task: {task description}
   - Verify: {verify command}
   - Max iterations: {max}

### RECALL

1. Read `memory/anvil-learnings.md` (use Read tool on the memory directory path)
2. If the file exists and has entries, search for entries related to the current task:
   - Look for entries where the title or "What worked"/"What failed" fields contain words from the current task description
   - Select the top 5 most relevant entries
3. If relevant entries found, store them for injection into the subagent prompt
4. If no learnings file exists or no matches, proceed without prior context

### DISPATCH (iteration {n} of {max})

Report to user: `--- Iteration {n}/{max} ---`

Build the subagent prompt based on whether this is a first attempt or a retry:

**First iteration (or first iteration with prior learnings):**

```
You are Anvil, an iteration engine forging code fixes.

## Task
{task description}

## Verification
After you make changes, this command will be run to check your work:
`{verify command}`

## Prior Learnings
{if matching learnings found}
Similar tasks have been solved before in this project:
{paste raw markdown of matching learning entries, max 2000 tokens}
{else}
No prior learnings found for this type of task.
{end}

## Instructions
1. Read the relevant code files to understand the problem
2. Make the MINIMAL fix needed — do not refactor unrelated code
3. Do NOT run the verification command yourself
4. After making changes, explain in one paragraph: what you changed and why
```

**Retry iteration (after failure):**

```
You are Anvil, an iteration engine forging code fixes.
This is attempt {n} of {max}. Previous attempts have failed.

## Task
{task description}

## Verification
`{verify command}`

## Previous Attempt #{n-1} Failed
**What was tried:** {previous subagent's explanation}
**Error output:**
{smart-chunked error output from previous verification, max 2000 chars}

{if n > 2}
## All Previous Attempts
{for each prior attempt: one-line summary of approach + one-line error}
{end}

## Instructions
1. The previous approach DID NOT WORK. Try something DIFFERENT.
2. Read the error output carefully — the answer is usually in there.
3. Make the MINIMAL fix needed.
4. Do NOT run the verification command yourself.
5. Explain what you changed and why it's different from the last attempt.
```

Dispatch the subagent using the Agent tool with `subagent_type: "general"`. Do NOT use `isolation: "worktree"` — changes must be visible in the main workspace.

After the subagent completes:
1. Capture the subagent's explanation of what it changed
2. Run `git diff --stat` via Bash to check if files were actually modified
3. If no files changed: log "no-op iteration" and on next retry add to the prompt: "WARNING: Your previous attempt made NO code changes. You MUST edit at least one file."

### VERIFY

Run the verification command via Bash tool with a 120-second timeout.

Capture:
- Exit code (0 = pass, non-zero = fail)
- stdout and stderr combined

If the output is long (>100 lines), pipe it through smart chunking:
```bash
echo "$RAW_OUTPUT" | npx anvil-cc chunk --type auto --max-chars 2000
```

### JOURNAL

After EVERY iteration (pass or fail), append to the current month's journal file (`memory/anvil-journal-YYYY-MM.md`):

```markdown
## Run: {ISO timestamp} | Task: {task}
### Iteration {n}/{max}
- **Status:** PASS/FAIL
- **Verify:** `{command}`
- **Approach:** {subagent's summary}
- **Error output:** {if failed, smart-chunked output}
- **Duration:** {approximate seconds}
```

If the journal file doesn't exist, create it with this header:
```markdown
---
name: Anvil Iteration Journal — {YYYY-MM}
description: Complete log of all Anvil iteration runs for {Month Year}
type: project
---
```

### State Persistence

After each iteration, write `.anvil-state.json` in the project root:
```json
{
  "task": "{task description}",
  "verify": "{verify command}",
  "max": {max},
  "iteration": {current n},
  "status": "in_progress",
  "errorSignatures": ["{first 100 chars of each unique error}"],
  "attempts": [
    {"n": 1, "approach": "...", "error": "first 100 chars", "status": "fail"}
  ]
}
```

### Circle Detection

Track the first 100 characters of each error output as a "signature". If the same signature appears 3 or more times, HALT and report to user:
"Anvil is going in circles. The error `{pattern}` has appeared {n} times. Consider simplifying the task or fixing manually."

### Decision: PASS or FAIL?

**If verification PASSED:**
1. Journal the success (see JOURNAL above)
2. Go to LEARN
3. Go to DONE

**If verification FAILED and iteration < max:**
1. Journal the failure
2. Save state to `.anvil-state.json`
3. Check for circles (see Circle Detection)
4. Go to DISPATCH with n+1

**If verification FAILED and iteration >= max:**
1. Journal the failure
2. Go to FAILED

### LEARN (on success only)

Append to `memory/anvil-learnings.md`:

```markdown
## {task description}
- **ID:** anvil-{YYYY-MM-DD}-{sequence number}
- **Date:** {YYYY-MM-DD}
- **Project:** {current working directory}
- **Iterations needed:** {n}
- **What worked:** {subagent's explanation of the successful fix}
- **What failed first:** {summary of failed approaches, or "None" if first try}
- **Verify command:** `{command}`
```

If the file doesn't exist, create it with this header:
```markdown
---
name: Anvil Learnings
description: Distilled problem-solution pairs from Anvil iterations for cross-session learning
type: project
---
```

### DONE

1. Delete `.anvil-state.json`
2. Report to user:
   ```
   Anvil completed in {n} iteration(s).
   Changes: {one-line summary of what the successful fix did}
   Journaled to memory/anvil-journal-{YYYY-MM}.md
   Learning saved to memory/anvil-learnings.md
   ```
3. Mark tasks as completed

### FAILED

1. Delete `.anvil-state.json`
2. Report to user:
   ```
   Anvil failed after {max} iterations.
   Summary of attempts:
   {numbered list: each attempt's approach + error in one line}

   Suggestions:
   - Simplify the task into smaller pieces
   - Increase --max (current: {max})
   - Fix manually using the error context above
   ```
```

- [ ] **Step 2: Create the hook script template**

Create `anvil-cc/src/templates/anvil-detect-hook.py`:

```python
#!/usr/bin/env python3
"""anvil-detect-hook.py — Thin PostToolUse hook that detects test/build failures."""
import json
import sys

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

    if data.get("tool_name") != "Bash":
        sys.exit(0)

    tool_input = data.get("tool_input", {})
    command = tool_input.get("command", "")
    tool_response = data.get("tool_response", "")

    response_str = json.dumps(tool_response) if isinstance(tool_response, dict) else str(tool_response)

    matched_pattern = None
    for pattern in DETECT_PATTERNS:
        if pattern in command:
            matched_pattern = pattern
            break

    if not matched_pattern:
        sys.exit(0)

    failure_indicators = ["error", "fail", "Error", "FAIL", "exit code", "non-zero", "Exception"]
    is_failure = any(indicator in response_str for indicator in failure_indicators)

    if is_failure:
        print(f'[Anvil] Detected failure in: {command}', file=sys.stderr)
        print(f'  Run: /anvil "Fix: {matched_pattern} failure" --verify "{command}"', file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Create starter memory templates**

Create `anvil-cc/src/templates/anvil-journal.md`:

```markdown
---
name: Anvil Iteration Journal — {{YYYY-MM}}
description: Complete log of all Anvil iteration runs for {{Month Year}}
type: project
---
```

Create `anvil-cc/src/templates/anvil-learnings.md`:

```markdown
---
name: Anvil Learnings
description: Distilled problem-solution pairs from Anvil iterations for cross-session learning
type: project
---
```

Create `anvil-cc/src/templates/anvil-config.md`:

```markdown
---
name: Anvil Configuration
description: Per-project Anvil preferences and detection patterns
type: project
---

## Mode
- **Recall mode:** lite

## Defaults
- **Max iterations:** 5
- **Verify timeout:** 120s
- **Max error output per entry:** 500 lines
- **Subagent prompt token budget:** 4000 tokens

## Journal
- **Rotation:** monthly
- **Max lines per entry:** 500
```

- [ ] **Step 4: Commit**

```bash
git add anvil-cc/src/templates/
git commit -m "feat: add template files — skill definition, hook script, memory starters"
```

---

## Task 6: Init Command

**Files:**
- Modify: `anvil-cc/src/commands/init.ts`
- Create: `anvil-cc/tests/init.test.ts`

- [ ] **Step 1: Write tests for init command**

Create `anvil-cc/tests/init.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We'll test the internal helpers, not the full CLI flow
import { resolveInstallPaths } from "../src/commands/init.js";

describe("init", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `anvil-init-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("resolves global install paths", () => {
    const paths = resolveInstallPaths("global", tmpDir);
    expect(paths.skillPath).toContain(".claude");
    expect(paths.skillPath).toContain("anvil");
    expect(paths.settingsPath).toContain(".claude");
  });

  it("resolves project install paths", () => {
    const paths = resolveInstallPaths("project", tmpDir);
    expect(paths.skillPath).toContain(tmpDir);
    expect(paths.skillPath).toContain("anvil.md");
    expect(paths.settingsPath).toContain(tmpDir);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd anvil-cc && npx vitest run tests/init.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement init.ts**

```typescript
import { mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  getGlobalSettingsPath,
  getGlobalSkillDir,
  getProjectSettingsPath,
  getProjectCommandDir,
  getHookInstallPath,
  isClaudeInstalled,
} from "../utils/detect-platform.js";
import { readSettings, writeSettings, mergeHook } from "../utils/claude-config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Templates live in src/templates/ and are copied to dist/templates/ by build script
const TEMPLATES_DIR = join(__dirname, "..", "templates");

export interface InstallPaths {
  skillPath: string;
  settingsPath: string;
  hookPath: string;
}

export function resolveInstallPaths(
  scope: "global" | "project",
  projectRoot: string
): InstallPaths {
  if (scope === "global") {
    return {
      skillPath: join(getGlobalSkillDir(), "SKILL.md"),
      settingsPath: getGlobalSettingsPath(),
      hookPath: getHookInstallPath(),
    };
  }
  return {
    skillPath: join(getProjectCommandDir(projectRoot), "anvil.md"),
    settingsPath: getProjectSettingsPath(projectRoot),
    hookPath: getHookInstallPath(),
  };
}

export default async function (args: string[]): Promise<void> {
  const isGlobal = args.includes("--global");
  const isProject = args.includes("--project");
  const isSmart = args.includes("--smart");

  if (!isClaudeInstalled()) {
    console.error("Error: Claude Code not found (~/.claude/ does not exist).");
    console.error("Install Claude Code first: https://docs.anthropic.com/en/docs/claude-code");
    process.exit(1);
  }

  const scope: "global" | "project" = isGlobal ? "global" : "project";
  const projectRoot = process.cwd();
  const paths = resolveInstallPaths(scope, projectRoot);

  // 1. Install skill file
  console.log(`Installing Anvil skill (${scope})...`);
  mkdirSync(dirname(paths.skillPath), { recursive: true });

  const skillTemplatePath = join(TEMPLATES_DIR, "anvil-skill.md");
  if (!existsSync(skillTemplatePath)) {
    console.error(`Error: Could not find skill template at ${skillTemplatePath}`);
    console.error("Ensure templates were copied to dist/templates/ during build.");
    process.exit(1);
  }
  copyFileSync(skillTemplatePath, paths.skillPath);
  console.log(`  Skill installed: ${paths.skillPath}`);

  // 2. Install hook script
  console.log("Installing detection hook...");
  mkdirSync(dirname(paths.hookPath), { recursive: true });
  const hookTemplatePath = join(TEMPLATES_DIR, "anvil-detect-hook.py");
  if (!existsSync(hookTemplatePath)) {
    console.error(`Error: Could not find hook template at ${hookTemplatePath}`);
    process.exit(1);
  }
  copyFileSync(hookTemplatePath, paths.hookPath);
  chmodSync(paths.hookPath, 0o755);
  console.log(`  Hook installed: ${paths.hookPath}`);

  // 3. Register hook in settings
  console.log("Registering hook in Claude Code settings...");
  const settings = readSettings(paths.settingsPath);
  const updated = mergeHook(settings, {
    event: "PostToolUse",
    matcher: "*",
    hook: {
      type: "command",
      command: `python3 ${paths.hookPath}`,
    },
  });
  writeSettings(paths.settingsPath, updated);
  console.log(`  Hook registered in: ${paths.settingsPath}`);

  // 4. Update project .gitignore
  const gitignorePath = join(projectRoot, ".gitignore");
  const gitignoreEntries = [".anvil-state.json", ".anvil-logs/"];
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    const toAdd = gitignoreEntries.filter((e) => !content.includes(e));
    if (toAdd.length > 0) {
      writeFileSync(gitignorePath, content.trimEnd() + "\n" + toAdd.join("\n") + "\n");
      console.log("  Updated .gitignore with Anvil entries");
    }
  }

  // 5. Smart mode setup
  if (isSmart) {
    console.log("\nSmart mode requested. Checking dependencies...");
    console.log("  Note: Smart mode requires Ollama + ChromaDB.");
    console.log("  Install Ollama: brew install ollama (macOS) or curl -fsSL https://ollama.com/install.sh | sh");
    console.log("  Pull model: ollama pull nomic-embed-text");
    console.log("  Install ChromaDB: pip install chromadb");
    console.log("  Smart mode recall will be available once dependencies are installed.");
  }

  // 5. Summary
  console.log(`
Anvil installed successfully!

Usage:
  /anvil "Fix failing tests" --verify "npm test"
  /anvil "Fix TypeScript errors" --verify tsc --max 10
  /anvil "Fix lint" --verify eslint

Mode: ${isSmart ? "Smart (vector search)" : "Lite (keyword recall)"}
Scope: ${scope}
  `);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd anvil-cc && npx vitest run tests/init.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add anvil-cc/src/commands/init.ts anvil-cc/tests/init.test.ts
git commit -m "feat: implement init command — installs skill, hook, and registers in settings"
```

---

## Task 7: Status and Uninstall Commands

**Files:**
- Modify: `anvil-cc/src/commands/status.ts`
- Modify: `anvil-cc/src/commands/uninstall.ts`

- [ ] **Step 1: Implement status.ts**

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getGlobalSettingsPath,
  getGlobalSkillDir,
  getProjectSettingsPath,
  getProjectCommandDir,
  getHookInstallPath,
} from "../utils/detect-platform.js";
import { readSettings } from "../utils/claude-config.js";
import { getLearningsPath, getConfigPath } from "../utils/memory-path.js";

export default async function (args: string[]): Promise<void> {
  const projectRoot = process.cwd();

  console.log("Anvil Status\n");

  // Check skill installation
  const globalSkill = existsSync(join(getGlobalSkillDir(), "SKILL.md"));
  const projectSkill = existsSync(
    join(getProjectCommandDir(projectRoot), "anvil.md")
  );

  console.log(`Skill (global):  ${globalSkill ? "installed" : "not found"}`);
  console.log(`Skill (project): ${projectSkill ? "installed" : "not found"}`);

  // Check hook
  const hookInstalled = existsSync(getHookInstallPath());
  console.log(`Hook:            ${hookInstalled ? "installed" : "not found"}`);

  // Check hook registration
  const globalSettings = readSettings(getGlobalSettingsPath());
  const projectSettings = readSettings(getProjectSettingsPath(projectRoot));
  const hookRegistered =
    JSON.stringify(globalSettings).includes("anvil-detect-hook") ||
    JSON.stringify(projectSettings).includes("anvil-detect-hook");
  console.log(`Hook registered:  ${hookRegistered ? "yes" : "no"}`);

  // Check mode
  const configPath = getConfigPath(projectRoot);
  let mode = "lite";
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8");
    if (content.includes("smart")) mode = "smart";
  }
  console.log(`Mode:            ${mode}`);

  // Check learnings
  const learningsPath = getLearningsPath(projectRoot);
  if (existsSync(learningsPath)) {
    const content = readFileSync(learningsPath, "utf-8");
    const entryCount = (content.match(/^## /gm) || []).length;
    console.log(`Learnings:       ${entryCount} entries`);
  } else {
    console.log(`Learnings:       none yet`);
  }
}
```

- [ ] **Step 2: Implement uninstall.ts**

```typescript
import { existsSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  getGlobalSettingsPath,
  getGlobalSkillDir,
  getProjectSettingsPath,
  getProjectCommandDir,
  getHookInstallPath,
  getAnvilDataDir,
} from "../utils/detect-platform.js";
import { readSettings, writeSettings, removeHook } from "../utils/claude-config.js";

export default async function (args: string[]): Promise<void> {
  const projectRoot = process.cwd();

  console.log("Uninstalling Anvil...\n");

  // Remove skill files
  const globalSkillPath = join(getGlobalSkillDir(), "SKILL.md");
  const projectSkillPath = join(getProjectCommandDir(projectRoot), "anvil.md");

  for (const path of [globalSkillPath, projectSkillPath]) {
    if (existsSync(path)) {
      unlinkSync(path);
      console.log(`  Removed skill: ${path}`);
    }
  }

  // Remove hook script
  const hookPath = getHookInstallPath();
  if (existsSync(hookPath)) {
    unlinkSync(hookPath);
    console.log(`  Removed hook: ${hookPath}`);
  }

  // Remove hook from settings
  for (const settingsPath of [
    getGlobalSettingsPath(),
    getProjectSettingsPath(projectRoot),
  ]) {
    if (existsSync(settingsPath)) {
      const settings = readSettings(settingsPath);
      const updated = removeHook(settings, "anvil-detect-hook");
      writeSettings(settingsPath, updated);
      console.log(`  Cleaned settings: ${settingsPath}`);
    }
  }

  // Remove .anvil-state.json if present
  const statePath = join(projectRoot, ".anvil-state.json");
  if (existsSync(statePath)) {
    unlinkSync(statePath);
    console.log(`  Removed state file: ${statePath}`);
  }

  console.log("\nAnvil uninstalled. Memory files preserved (delete manually if desired).");
}
```

- [ ] **Step 3: Build and verify**

```bash
cd anvil-cc && npx tsc
```

Expected: Clean compilation.

- [ ] **Step 4: Commit**

```bash
git add anvil-cc/src/commands/status.ts anvil-cc/src/commands/uninstall.ts
git commit -m "feat: implement status and uninstall commands"
```

---

## Task 8: Reindex Command (Smart Mode Foundation)

**Files:**
- Create: `anvil-cc/src/memory/indexer.ts`
- Create: `anvil-cc/src/memory/reindexer.ts`
- Create: `anvil-cc/src/memory/smart-recall.ts`
- Modify: `anvil-cc/src/commands/reindex.ts`

- [ ] **Step 1: Create indexer.ts — interface for vector operations**

This module defines the interface. The actual ChromaDB/Ollama calls are isolated so they can be swapped or mocked.

```typescript
import { LearningEntry } from "./lite-recall.js";

export interface VectorStore {
  embed(text: string): Promise<number[]>;
  upsert(id: string, embedding: number[], metadata: Record<string, string>): Promise<void>;
  query(embedding: number[], topK: number): Promise<{ id: string; score: number }[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

export async function indexLearning(
  store: VectorStore,
  entry: LearningEntry
): Promise<void> {
  const text = `${entry.title} ${entry.whatWorked} ${entry.whatFailed}`;
  const embedding = await store.embed(text);
  await store.upsert(entry.id, embedding, {
    title: entry.title,
    date: entry.date,
    verifyCommand: entry.verifyCommand,
  });
}

export async function indexAllLearnings(
  store: VectorStore,
  entries: LearningEntry[]
): Promise<number> {
  let count = 0;
  for (const entry of entries) {
    if (!entry.id) continue;
    await indexLearning(store, entry);
    count++;
  }
  return count;
}
```

- [ ] **Step 2: Create smart-recall.ts**

```typescript
import { LearningEntry, parseLearnings } from "./lite-recall.js";
import { VectorStore } from "./indexer.js";
import { readFileSync, existsSync } from "node:fs";

export async function smartRecall(
  store: VectorStore,
  learningsPath: string,
  query: string,
  maxResults: number
): Promise<LearningEntry[]> {
  if (!existsSync(learningsPath)) return [];

  const embedding = await store.embed(query);
  const results = await store.query(embedding, maxResults);

  if (results.length === 0) return [];

  // Read the learnings file and parse
  const content = readFileSync(learningsPath, "utf-8");
  const allEntries = parseLearnings(content);

  // Match by ID
  const matched: LearningEntry[] = [];
  for (const result of results) {
    const entry = allEntries.find((e) => e.id === result.id);
    if (entry) matched.push(entry);
  }

  return matched;
}
```

- [ ] **Step 3: Create reindexer.ts**

```typescript
import { readFileSync, existsSync } from "node:fs";
import { parseLearnings } from "./lite-recall.js";
import { indexAllLearnings, VectorStore } from "./indexer.js";

export async function reindexFromMarkdown(
  store: VectorStore,
  learningsPath: string
): Promise<{ indexed: number; skipped: number }> {
  if (!existsSync(learningsPath)) {
    return { indexed: 0, skipped: 0 };
  }

  const content = readFileSync(learningsPath, "utf-8");
  const entries = parseLearnings(content);

  // Clear existing index
  await store.clear();

  const withId = entries.filter((e) => e.id);
  const withoutId = entries.filter((e) => !e.id);

  const indexed = await indexAllLearnings(store, withId);

  return { indexed, skipped: withoutId.length };
}
```

- [ ] **Step 4: Implement reindex command**

Update `anvil-cc/src/commands/reindex.ts`:

```typescript
import { getLearningsPath } from "../utils/memory-path.js";

export default async function (args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const learningsPath = getLearningsPath(projectRoot);

  console.log("Anvil Reindex\n");
  console.log(`Learnings file: ${learningsPath}`);

  // For now, reindex is a placeholder that validates the learnings file
  // Full ChromaDB integration requires the chromadb package
  try {
    const { existsSync, readFileSync } = await import("node:fs");
    if (!existsSync(learningsPath)) {
      console.log("No learnings file found. Nothing to reindex.");
      return;
    }

    const { parseLearnings } = await import("../memory/lite-recall.js");
    const content = readFileSync(learningsPath, "utf-8");
    const entries = parseLearnings(content);
    const withId = entries.filter((e) => e.id);
    const withoutId = entries.filter((e) => !e.id);

    console.log(`Total entries: ${entries.length}`);
    console.log(`With ID (indexable): ${withId.length}`);
    console.log(`Without ID (skipped): ${withoutId.length}`);

    // TODO: When ChromaDB integration is added, actually rebuild the index here
    // For now, just validate
    console.log("\nNote: Full vector reindexing requires Smart mode (--smart).");
    console.log("Run 'npx anvil-cc init --smart' to enable.");
  } catch (err) {
    console.error("Reindex failed:", err);
    process.exit(1);
  }
}
```

- [ ] **Step 5: Build and verify**

```bash
cd anvil-cc && npx tsc
```

Expected: Clean compilation.

- [ ] **Step 6: Commit**

```bash
git add anvil-cc/src/memory/ anvil-cc/src/commands/reindex.ts
git commit -m "feat: add memory module — indexer, smart-recall, reindexer, lite-recall integration"
```

---

## Task 9: End-to-End CLI Test

**Files:**
- Create: `anvil-cc/tests/cli.test.ts`

- [ ] **Step 1: Write CLI integration test**

```typescript
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, "..", "dist", "cli.js");

describe("CLI", () => {
  it("shows usage on --help", () => {
    const output = execSync(`node ${CLI_PATH} --help`, { encoding: "utf-8" });
    expect(output).toContain("anvil-cc");
    expect(output).toContain("init");
    expect(output).toContain("status");
    expect(output).toContain("chunk");
  });

  it("exits with error on unknown command", () => {
    try {
      execSync(`node ${CLI_PATH} foobar`, { encoding: "utf-8" });
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.status).not.toBe(0);
    }
  });

  it("chunk command processes piped input", () => {
    const output = execSync(
      `echo "TypeError: foo\n    at bar (src/x.ts:1:1)\n    at node_modules/y.js:2:2" | node ${CLI_PATH} chunk`,
      { encoding: "utf-8" }
    );
    expect(output).toContain("src/x.ts");
    expect(output).not.toContain("node_modules");
  });
});
```

- [ ] **Step 2: Build and run all tests**

```bash
cd anvil-cc && npx tsc && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add anvil-cc/tests/cli.test.ts
git commit -m "test: add end-to-end CLI integration tests"
```

---

## Task 10: Git Init and Final Verification

- [ ] **Step 1: Initialize git repo if not already**

```bash
cd "/Users/abdullah/Documents/Abdullah Pers Projects/Jarvis"
git init
echo "node_modules/" >> .gitignore
echo "dist/" >> .gitignore
echo ".anvil-logs/" >> .gitignore
echo ".anvil-state.json" >> .gitignore
git add .
git commit -m "feat: initial Anvil-CC project — iterative code forging engine for Claude Code

Includes:
- CLI scaffolding (npx anvil-cc init/status/chunk/reindex/uninstall)
- Smart error chunking (stack/tsc/test/lint/generic detection)
- Lite recall (keyword-based learning retrieval)
- Smart mode foundation (vector search interfaces for ChromaDB/Ollama)
- Skill template (/anvil slash command with full iteration state machine)
- Detection hook (PostToolUse failure detection)
- Platform utilities (claude config, memory paths)
- Test suite (vitest)"
```

- [ ] **Step 2: Run full test suite one final time**

```bash
cd anvil-cc && npm test
```

Expected: All tests PASS.

- [ ] **Step 3: Verify build produces working CLI**

```bash
cd anvil-cc && npx tsc && node dist/cli.js --help
```

Expected: Usage output printed cleanly.

---

## Dependency Graph

```
Task 1 (Scaffolding)
  └── Task 2 (Platform Utils)
       ├── Task 3 (Smart Chunking)     [independent]
       ├── Task 4 (Lite Recall)        [independent]
       ├── Task 5 (Templates)          [independent]
       └── Task 6 (Init Command)       [depends on 2, 5]
            ├── Task 7 (Status/Uninstall) [depends on 2, 6]
            └── Task 8 (Smart Mode)      [depends on 4]
                 └── Task 9 (E2E Tests)  [depends on all]
                      └── Task 10 (Final) [depends on all]
```

Tasks 3, 4, and 5 can run in parallel after Task 2 completes.
