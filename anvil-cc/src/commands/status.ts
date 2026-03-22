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

export default async function (_args: string[]): Promise<void> {
  const projectRoot = process.cwd();

  console.log("Anvil Status\n");

  const globalSkill = existsSync(join(getGlobalSkillDir(), "SKILL.md"));
  const projectSkill = existsSync(
    join(getProjectCommandDir(projectRoot), "anvil.md")
  );

  console.log(`Skill (global):  ${globalSkill ? "installed" : "not found"}`);
  console.log(`Skill (project): ${projectSkill ? "installed" : "not found"}`);

  const hookInstalled = existsSync(getHookInstallPath());
  console.log(`Hook:            ${hookInstalled ? "installed" : "not found"}`);

  const globalSettings = readSettings(getGlobalSettingsPath());
  const projectSettings = readSettings(getProjectSettingsPath(projectRoot));
  const hookRegistered =
    JSON.stringify(globalSettings).includes("anvil-detect-hook") ||
    JSON.stringify(projectSettings).includes("anvil-detect-hook");
  console.log(`Hook registered: ${hookRegistered ? "yes" : "no"}`);

  const configPath = getConfigPath(projectRoot);
  let mode = "lite";
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8");
    if (content.includes("smart")) mode = "smart";
  }
  console.log(`Mode:            ${mode}`);

  const learningsPath = getLearningsPath(projectRoot);
  if (existsSync(learningsPath)) {
    const content = readFileSync(learningsPath, "utf-8");
    const entryCount = (content.match(/^## /gm) || []).length;
    console.log(`Learnings:       ${entryCount} entries`);
  } else {
    console.log(`Learnings:       none yet`);
  }
}
