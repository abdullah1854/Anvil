import { mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
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

  // 6. Summary
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
