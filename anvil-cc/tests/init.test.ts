import { describe, it, expect } from "vitest";
import { resolveInstallPaths } from "../src/commands/init.js";

describe("init", () => {
  it("resolves global install paths", () => {
    const paths = resolveInstallPaths("global", "/tmp/test-project");
    expect(paths.skillPath).toContain(".claude");
    expect(paths.skillPath).toContain("anvil");
    expect(paths.skillPath).toContain("SKILL.md");
    expect(paths.settingsPath).toContain(".claude");
  });

  it("resolves project install paths", () => {
    const paths = resolveInstallPaths("project", "/tmp/test-project");
    expect(paths.skillPath).toContain("/tmp/test-project");
    expect(paths.skillPath).toContain("anvil.md");
    expect(paths.settingsPath).toContain("/tmp/test-project");
  });
});
