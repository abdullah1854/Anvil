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

  await store.clear();

  const withId = entries.filter((e) => e.id);
  const withoutId = entries.filter((e) => !e.id);

  const indexed = await indexAllLearnings(store, withId);

  return { indexed, skipped: withoutId.length };
}
