import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, "..", "dist", "cli.js");
const AUTOMATION_DESCRIPTION =
  "Automates: fix code → run your test/build/lint check → retry with the latest error until it passes or max attempts are reached";

/** Quote a path for shell usage (handles spaces) */
function q(p: string): string {
  return `"${p}"`;
}

describe("CLI", () => {
  beforeAll(() => {
    // Ensure dist is built
    execSync("npm run build", {
      cwd: join(__dirname, ".."),
      encoding: "utf-8",
      stdio: "pipe",
    });
  });

  it("shows usage on --help", () => {
    const output = execSync(`node ${q(CLI_PATH)} --help`, {
      encoding: "utf-8",
    });
    expect(output).toContain("anvil-cc");
    expect(output).toContain(AUTOMATION_DESCRIPTION);
    expect(output).toContain("init");
    expect(output).toContain("status");
    expect(output).toContain("chunk");
  });

  it("exits with error on unknown command", () => {
    try {
      execSync(`node ${q(CLI_PATH)} foobar`, {
        encoding: "utf-8",
        stdio: "pipe",
      });
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.status).not.toBe(0);
    }
  });

  it("chunk command processes piped stack trace input", () => {
    const input =
      "TypeError: foo\\n    at bar (src/x.ts:1:1)\\n    at node_modules/y.js:2:2";
    const output = execSync(
      `printf "${input}" | node ${q(CLI_PATH)} chunk`,
      {
        encoding: "utf-8",
        shell: "/bin/bash",
      },
    );
    expect(output).toContain("src/x.ts");
    expect(output).not.toContain("node_modules");
  });

  it("shows usage with no arguments", () => {
    const output = execSync(`node ${q(CLI_PATH)}`, { encoding: "utf-8" });
    expect(output).toContain("anvil-cc");
    expect(output).toContain(AUTOMATION_DESCRIPTION);
  });
});
