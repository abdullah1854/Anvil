#!/usr/bin/env node

const args = process.argv.slice(2);
const command = args[0];

const COMMANDS = ["init", "status", "reindex", "chunk", "uninstall"] as const;
type Command = (typeof COMMANDS)[number];

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  if (!COMMANDS.includes(command as Command)) {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  const mod = await import(`./commands/${command}.js`);
  await mod.default(args.slice(1));
}

function printUsage(): void {
  console.log(`
anvil-cc — Iterative code forging engine for Claude Code
Automates: fix code → run your test/build/lint check → retry with the latest error until it passes or max attempts are reached

Usage:
  anvil-cc init [--smart] [--global|--project]   Install skill + hooks
  anvil-cc status                                 Show install status
  anvil-cc reindex                                Rebuild vector index
  anvil-cc chunk [--type auto|jest|tsc|eslint]    Smart error chunking (piped)
  anvil-cc uninstall                              Remove skill + hooks
  `.trim());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
