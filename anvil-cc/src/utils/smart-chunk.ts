export type ErrorType = "test" | "tsc" | "stack" | "lint" | "generic";

export function detectErrorType(output: string): ErrorType {
  if (/^FAIL\s/m.test(output) || /●\s/.test(output) || /✕\s/.test(output) || /FAILED\s/m.test(output)) {
    return "test";
  }
  if (/error TS\d+/.test(output)) {
    return "tsc";
  }
  if (/\d+:\d+\s+(error|warning)\s+/.test(output)) {
    return "lint";
  }
  if (/^\s+at\s+/m.test(output) || /File ".*", line \d+/m.test(output)) {
    return "stack";
  }
  return "generic";
}

export function smartChunk(output: string, maxChars: number): string {
  const type = detectErrorType(output);
  switch (type) {
    case "stack": return chunkStack(output, maxChars);
    case "tsc": return chunkTsc(output, maxChars);
    case "test": return chunkTest(output, maxChars);
    case "lint": return chunkLint(output, maxChars);
    default: return chunkGeneric(output, maxChars);
  }
}

function chunkStack(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const errorLine = lines.find(
    (l) => /Error:|TypeError:|ReferenceError:|SyntaxError:/.test(l)
  );
  const userFrames = lines.filter(
    (l) =>
      /^\s+at\s+/.test(l) &&
      !l.includes("node_modules") &&
      !l.includes("internal/") &&
      !l.includes("site-packages")
  );
  const parts: string[] = [];
  if (errorLine) parts.push(errorLine.trim());
  parts.push(...userFrames.slice(0, 5).map((l) => l.trim()));
  const result = parts.join("\n");
  return result.length <= maxChars ? result : truncate(result, maxChars);
}

function chunkTsc(output: string, maxChars: number): string {
  const lines = output.split("\n").filter((l) => /error TS\d+/.test(l));
  const groups = new Map<string, string[]>();
  for (const line of lines) {
    const match = line.match(/error (TS\d+: .+)$/);
    if (match) {
      const key = match[1];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(line);
    }
  }
  const parts: string[] = [];
  for (const [, occurrences] of groups) {
    if (occurrences.length === 1) {
      parts.push(occurrences[0]);
    } else {
      parts.push(`${occurrences[0]} (${occurrences.length} occurrences)`);
    }
  }
  const result = parts.join("\n");
  return result.length <= maxChars ? result : truncate(result, maxChars);
}

function chunkTest(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const parts: string[] = [];
  let inFailBlock = false;
  for (const line of lines) {
    if (/^FAIL\s/.test(line)) { parts.push(line); inFailBlock = true; continue; }
    if (/^PASS\s/.test(line)) { inFailBlock = false; continue; }
    if (inFailBlock) {
      if (/^\s+●\s/.test(line) || /^\s+✕\s/.test(line)) { parts.push(line); }
      else if (/expect|assert|Error:|Expected:|Received:/i.test(line)) { parts.push(line); }
    }
  }
  const result = parts.join("\n");
  return result.length <= maxChars ? result : truncate(result, maxChars);
}

function chunkLint(output: string, maxChars: number): string {
  const lines = output.split("\n");
  const groups = new Map<string, { first: string; count: number }>();
  for (const line of lines) {
    const match = line.match(/\d+:\d+\s+(error|warning)\s+(.+?)\s+(\S+)$/);
    if (match) {
      const rule = match[3];
      if (!groups.has(rule)) groups.set(rule, { first: line.trim(), count: 0 });
      groups.get(rule)!.count++;
    }
  }
  const parts: string[] = [];
  for (const [, { first, count }] of groups) {
    parts.push(count === 1 ? first : `${first} (${count} total)`);
  }
  const result = parts.join("\n");
  return result.length <= maxChars ? result : truncate(result, maxChars);
}

function chunkGeneric(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;
  return truncate(output, maxChars);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const headSize = Math.floor(maxChars * 0.25);
  const tailSize = Math.floor(maxChars * 0.65);
  const marker = "\n\n... truncated ...\n\n";
  return text.slice(0, headSize) + marker + text.slice(-tailSize);
}
