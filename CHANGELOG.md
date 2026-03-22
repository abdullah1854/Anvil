# Changelog

All notable changes to Anvil will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-22

### Added

- CLI scaffolding with 5 commands: `init`, `status`, `chunk`, `reindex`, `uninstall`
- `/anvil` skill file with full iteration state machine (INIT, RECALL, DISPATCH, VERIFY, JOURNAL, LEARN, DONE/FAILED)
- Smart error chunking with 5 error type handlers: stack traces, TypeScript, test failures, lint, generic
- Lite recall: keyword-based learning retrieval from markdown
- Smart mode foundation: `VectorStore` interface for future ChromaDB/Ollama integration
- PostToolUse detection hook that suggests `/anvil` on test/build failures
- Monthly journal rotation (`anvil-journal-YYYY-MM.md`)
- Built-in verification checks: tsc, eslint, jest, vitest, pytest, build, cargo, go
- Circle detection: halts after 3 identical error signatures
- Crash recovery via `.anvil-state.json` state persistence
- 26 tests across 5 test files
