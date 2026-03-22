import { describe, it, expect } from "vitest";
import { parseLearnings, keywordRecall } from "../src/memory/lite-recall.js";

const SAMPLE_LEARNINGS = `---
name: Anvil Learnings
description: Distilled problem-solution pairs
type: project
---

## Fix failing auth tests
- **ID:** anvil-2026-03-22-001
- **Date:** 2026-03-22
- **Iterations needed:** 2
- **What worked:** Token refresh logic was using cached expired token.
- **What failed first:** Tried adjusting JWT expiry duration
- **Verify command:** \`npm test\`

## Fix TypeScript build errors
- **ID:** anvil-2026-03-22-002
- **Date:** 2026-03-22
- **Iterations needed:** 1
- **What worked:** Missing type export in index.ts barrel file
- **What failed first:** None
- **Verify command:** \`npx tsc --noEmit\`

## Fix database connection timeout
- **ID:** anvil-2026-03-23-001
- **Date:** 2026-03-23
- **Iterations needed:** 3
- **What worked:** Connection pool was exhausted. Increased pool size and added cleanup.
- **What failed first:** Tried increasing timeout, then tried retry logic
- **Verify command:** \`npm test\`
`;

describe("parseLearnings", () => {
  it("parses markdown into structured entries", () => {
    const entries = parseLearnings(SAMPLE_LEARNINGS);
    expect(entries).toHaveLength(3);
    expect(entries[0].title).toBe("Fix failing auth tests");
    expect(entries[0].id).toBe("anvil-2026-03-22-001");
    expect(entries[0].whatWorked).toContain("Token refresh");
  });
});

describe("keywordRecall", () => {
  it("finds entries matching keywords", () => {
    const entries = parseLearnings(SAMPLE_LEARNINGS);
    const results = keywordRecall(entries, "auth token test", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe("Fix failing auth tests");
  });

  it("returns empty for no matches", () => {
    const entries = parseLearnings(SAMPLE_LEARNINGS);
    const results = keywordRecall(entries, "kubernetes deployment yaml", 5);
    expect(results).toHaveLength(0);
  });

  it("respects max results", () => {
    const entries = parseLearnings(SAMPLE_LEARNINGS);
    const results = keywordRecall(entries, "fix", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
