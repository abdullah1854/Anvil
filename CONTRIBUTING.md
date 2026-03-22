# Contributing to Anvil

Thanks for your interest in contributing to Anvil! This guide will help you get started.

## Development Setup

```bash
git clone https://github.com/abdullah1854/Anvil.git
cd Anvil/anvil-cc
npm install
npm run build
npm test
```

## Project Structure

```
anvil-cc/
├── src/
│   ├── cli.ts                 # CLI entry point
│   ├── commands/              # CLI commands (init, status, chunk, reindex, uninstall)
│   ├── memory/                # Recall systems (lite keyword + smart vector)
│   ├── utils/                 # Platform detection, config, chunking
│   └── templates/             # Skill file, hook script, memory starters
└── tests/                     # Vitest test suite
```

## Making Changes

1. **Fork** the repo and create a feature branch
2. **Write tests first** — we follow TDD. Add tests in `tests/` before implementation.
3. **Run the test suite** — `npm test` must pass before submitting
4. **Run type checking** — `npm run lint` (runs `tsc --noEmit`)
5. **Keep changes minimal** — one feature or fix per PR

## Code Style

- TypeScript with strict mode
- ESM only (`import`, never `require`)
- No external runtime dependencies (dev deps only)
- Functions over classes where possible
- Descriptive names, minimal comments (code should be self-documenting)

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npx vitest run tests/smart-chunk.test.ts  # Run specific test file
```

All tests use [Vitest](https://vitest.dev/). Test files live in `tests/` and import from `../src/`.

## What to Contribute

- **Bug fixes** — always welcome
- **New built-in checks** — add to the check resolution table in `anvil-skill.md`
- **Smart chunking rules** — new error type handlers in `smart-chunk.ts`
- **Platform support** — Windows paths, WSL edge cases
- **Smart mode** — ChromaDB/Ollama integration for vector search recall
- **Documentation** — improvements to README, examples, guides

## Pull Request Process

1. Ensure tests pass and types check
2. Update README if adding user-facing features
3. Keep PR description concise — what changed and why
4. One reviewer approval required for merge

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node version, Claude Code version)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
