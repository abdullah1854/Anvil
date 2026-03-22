import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readSettings, mergeHook, removeHook, writeSettings } from "../src/utils/claude-config.js";
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
    expect(result.hooks!.PostToolUse).toHaveLength(1);
    expect(result.hooks!.PostToolUse[0].matcher).toBe("*");
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
    expect(result.hooks!.PostToolUse).toHaveLength(1);
  });

  it("removes a hook by command substring", () => {
    const settings = {
      hooks: {
        PostToolUse: [{
          matcher: "*",
          hooks: [{ type: "command", command: "python3 anvil-detect-hook.py" }],
        }],
      },
    };
    const result = removeHook(settings, "anvil-detect-hook");
    expect(result.hooks!.PostToolUse).toBeUndefined();
  });

  it("writes and reads settings round-trip", () => {
    const path = join(tmpDir, "sub", "settings.json");
    const settings = { hooks: { PostToolUse: [] as any[] }, customKey: "value" };
    writeSettings(path, settings);
    const read = readSettings(path);
    expect(read).toEqual(settings);
  });
});
