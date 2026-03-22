#!/usr/bin/env python3
"""anvil-detect-hook.py — Thin PostToolUse hook that detects test/build failures."""
import json
import sys

DETECT_PATTERNS = [
    "npm test", "npm run test", "npx jest", "npx vitest",
    "npm run build", "npx tsc",
    "npm run lint", "npx eslint",
    "pytest", "python -m pytest",
    "cargo build", "cargo test",
    "go build", "go test",
    "make test", "make build",
]

def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    if data.get("tool_name") != "Bash":
        sys.exit(0)

    tool_input = data.get("tool_input", {})
    command = tool_input.get("command", "")
    tool_response = data.get("tool_response", "")

    response_str = json.dumps(tool_response) if isinstance(tool_response, dict) else str(tool_response)

    matched_pattern = None
    for pattern in DETECT_PATTERNS:
        if pattern in command:
            matched_pattern = pattern
            break

    if not matched_pattern:
        sys.exit(0)

    failure_indicators = ["error", "fail", "Error", "FAIL", "exit code", "non-zero", "Exception"]
    is_failure = any(indicator in response_str for indicator in failure_indicators)

    if is_failure:
        print(f'[Anvil] Detected failure in: {command}', file=sys.stderr)
        print(f'  Run: /anvil "Fix: {matched_pattern} failure" --verify "{command}"', file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
