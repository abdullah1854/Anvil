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
