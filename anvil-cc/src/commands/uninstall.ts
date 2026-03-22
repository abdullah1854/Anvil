import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  getGlobalSettingsPath,
  getGlobalSkillDir,
  getProjectSettingsPath,
  getProjectCommandDir,
  getHookInstallPath,
} from "../utils/detect-platform.js";
import { readSettings, writeSettings, removeHook } from "../utils/claude-config.js";

export default async function (_args: string[]): Promise<void> {
  const projectRoot = process.cwd();

  console.log("Uninstalling Anvil...\n");

  const globalSkillPath = join(getGlobalSkillDir(), "SKILL.md");
  const projectSkillPath = join(getProjectCommandDir(projectRoot), "anvil.md");

  for (const path of [globalSkillPath, projectSkillPath]) {
    if (existsSync(path)) {
      unlinkSync(path);
      console.log(`  Removed skill: ${path}`);
    }
  }

  const hookPath = getHookInstallPath();
  if (existsSync(hookPath)) {
    unlinkSync(hookPath);
    console.log(`  Removed hook: ${hookPath}`);
  }

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

  const statePath = join(projectRoot, ".anvil-state.json");
  if (existsSync(statePath)) {
    unlinkSync(statePath);
    console.log(`  Removed state file: ${statePath}`);
  }

  console.log("\nAnvil uninstalled. Memory files preserved (delete manually if desired).");
}
