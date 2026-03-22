export interface LearningEntry {
  title: string;
  id: string;
  date: string;
  iterationsNeeded: number;
  whatWorked: string;
  whatFailed: string;
  verifyCommand: string;
  raw: string;
}

export function parseLearnings(markdown: string): LearningEntry[] {
  const entries: LearningEntry[] = [];
  const sections = markdown.split(/^## /m).slice(1);

  for (const section of sections) {
    const lines = section.split("\n");
    const title = lines[0].trim();
    const raw = `## ${section.trim()}`;

    const getField = (name: string): string => {
      const line = lines.find((l) => l.includes(`**${name}:**`));
      if (!line) return "";
      return line.replace(/.*\*\*.*?\*\*\s*/, "").trim().replace(/^`|`$/g, "");
    };

    entries.push({
      title,
      id: getField("ID"),
      date: getField("Date"),
      iterationsNeeded: parseInt(getField("Iterations needed"), 10) || 0,
      whatWorked: getField("What worked"),
      whatFailed: getField("What failed first"),
      verifyCommand: getField("Verify command"),
      raw,
    });
  }

  return entries;
}

export function keywordRecall(
  entries: LearningEntry[],
  query: string,
  maxResults: number
): LearningEntry[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scored = entries
    .map((entry) => {
      const entryText =
        `${entry.title} ${entry.whatWorked} ${entry.whatFailed}`.toLowerCase();
      const entryTokens = new Set(tokenize(entryText));

      let score = 0;
      for (const qt of queryTokens) {
        for (const et of entryTokens) {
          if (et.includes(qt) || qt.includes(et)) {
            score++;
          }
        }
      }

      return { entry, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored.map((s) => s.entry);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}
