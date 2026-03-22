import { existsSync, readFileSync } from "node:fs";
import { getLearningsPath } from "../utils/memory-path.js";
import { parseLearnings } from "../memory/lite-recall.js";

export default async function (_args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const learningsPath = getLearningsPath(projectRoot);

  console.log("Anvil Reindex\n");
  console.log(`Learnings file: ${learningsPath}`);

  if (!existsSync(learningsPath)) {
    console.log("No learnings file found. Nothing to reindex.");
    return;
  }

  const content = readFileSync(learningsPath, "utf-8");
  const entries = parseLearnings(content);
  const withId = entries.filter((e) => e.id);
  const withoutId = entries.filter((e) => !e.id);

  console.log(`Total entries: ${entries.length}`);
  console.log(`With ID (indexable): ${withId.length}`);
  console.log(`Without ID (skipped): ${withoutId.length}`);

  // TODO: When ChromaDB integration is added, actually rebuild the index here
  console.log("\nNote: Full vector reindexing requires Smart mode (--smart).");
  console.log("Run 'npx anvil-cc init --smart' to enable.");
}
