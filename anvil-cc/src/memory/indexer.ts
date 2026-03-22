import { LearningEntry } from "./lite-recall.js";

export interface VectorStore {
  embed(text: string): Promise<number[]>;
  upsert(id: string, embedding: number[], metadata: Record<string, string>): Promise<void>;
  query(embedding: number[], topK: number): Promise<{ id: string; score: number }[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

export async function indexLearning(
  store: VectorStore,
  entry: LearningEntry
): Promise<void> {
  const text = `${entry.title} ${entry.whatWorked} ${entry.whatFailed}`;
  const embedding = await store.embed(text);
  await store.upsert(entry.id, embedding, {
    title: entry.title,
    date: entry.date,
    verifyCommand: entry.verifyCommand,
  });
}

export async function indexAllLearnings(
  store: VectorStore,
  entries: LearningEntry[]
): Promise<number> {
  let count = 0;
  for (const entry of entries) {
    if (!entry.id) continue;
    await indexLearning(store, entry);
    count++;
  }
  return count;
}
