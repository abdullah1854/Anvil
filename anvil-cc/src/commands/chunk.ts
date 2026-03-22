import { smartChunk } from "../utils/smart-chunk.js";

export default async function (args: string[]): Promise<void> {
  const maxFlag = args.indexOf("--max-chars");
  const maxChars = maxFlag !== -1 ? parseInt(args[maxFlag + 1], 10) : 2000;

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const input = Buffer.concat(chunks).toString("utf-8");

  if (!input.trim()) {
    process.exit(0);
  }

  const result = smartChunk(input, maxChars);
  process.stdout.write(result);
}
