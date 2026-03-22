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
