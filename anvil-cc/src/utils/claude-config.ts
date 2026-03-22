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
