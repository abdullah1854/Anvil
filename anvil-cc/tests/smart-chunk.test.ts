import { describe, it, expect } from "vitest";
import { smartChunk, detectErrorType } from "../src/utils/smart-chunk.js";

describe("detectErrorType", () => {
  it("detects jest/vitest test failures", () => {
    const output = `FAIL src/auth.test.ts
  ● login > should validate token
    expect(received).toBe(expected)
    Expected: 200
    Received: 401`;
    expect(detectErrorType(output)).toBe("test");
  });

  it("detects TypeScript compilation errors", () => {
    const output = `src/index.ts(12,5): error TS2304: Cannot find name 'foo'.
src/index.ts(15,3): error TS2304: Cannot find name 'bar'.`;
    expect(detectErrorType(output)).toBe("tsc");
  });

  it("detects stack traces", () => {
    const output = `TypeError: Cannot read property 'id' of undefined
    at UserService.getById (src/user.ts:42:10)
    at node_modules/express/lib/router.js:123:5`;
    expect(detectErrorType(output)).toBe("stack");
  });

  it("detects eslint errors", () => {
    const output = `src/index.ts
  12:5  error  Unexpected any  @typescript-eslint/no-explicit-any
  15:3  error  Missing return type  @typescript-eslint/explicit-function-return-type`;
    expect(detectErrorType(output)).toBe("lint");
  });

  it("falls back to generic", () => {
    expect(detectErrorType("something went wrong")).toBe("generic");
  });
});

describe("smartChunk", () => {
  it("extracts only user frames from stack traces", () => {
    const output = `TypeError: Cannot read property 'id' of undefined
    at UserService.getById (src/user.ts:42:10)
    at processRequest (src/handler.ts:18:5)
    at Layer.handle (node_modules/express/lib/router/layer.js:95:5)
    at next (node_modules/express/lib/router/route.js:144:13)
    at Object.<anonymous> (node_modules/express/lib/router/index.js:284:7)`;
    const result = smartChunk(output, 2000);
    expect(result).toContain("src/user.ts:42");
    expect(result).toContain("src/handler.ts:18");
    expect(result).not.toContain("node_modules");
  });

  it("deduplicates repeated tsc errors", () => {
    const lines = Array.from({ length: 50 }, (_, i) =>
      `src/file${i}.ts(1,1): error TS2304: Cannot find name 'foo'.`
    ).join("\n");
    const result = smartChunk(lines, 2000);
    expect(result).toContain("Cannot find name 'foo'");
    expect(result).toContain("50 occurrences");
    expect(result.length).toBeLessThan(lines.length);
  });

  it("extracts failing test names and assertions", () => {
    const output = `PASS src/utils.test.ts
FAIL src/auth.test.ts
  ● login > should validate token
    expect(received).toBe(expected)
    Expected: 200
    Received: 401
  ● login > should refresh expired token
    Error: Token expired
PASS src/db.test.ts`;
    const result = smartChunk(output, 2000);
    expect(result).toContain("should validate token");
    expect(result).toContain("should refresh expired token");
    expect(result).not.toContain("PASS");
  });

  it("respects maxChars limit", () => {
    const longOutput = "x".repeat(5000);
    const result = smartChunk(longOutput, 500);
    expect(result.length).toBeLessThanOrEqual(550);
  });

  it("falls back to head+tail for generic errors", () => {
    const output = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
    const result = smartChunk(output, 200);
    expect(result).toContain("line 0");
    expect(result).toContain("line 99");
    expect(result).toContain("... truncated");
  });
});
