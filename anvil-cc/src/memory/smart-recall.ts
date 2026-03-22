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

  const content = readFileSync(learningsPath, "utf-8");
  const allEntries = parseLearnings(content);

  const matched: LearningEntry[] = [];
  for (const result of results) {
    const entry = allEntries.find((e) => e.id === result.id);
    if (entry) matched.push(entry);
  }

  return matched;
}
