// The one shared parser concern: chunk source into definition blocks and tag each with
// its construct kind. Each module then parses an already-isolated block, so the
// per-construct grammars never have to compose.
//
// SLICE 1 — MINIMAL. Recognizes only `defrecord … end` (the one construct wired so far)
// and skips everything else, so a mixed file still yields just its records. Deferred to
// its own later slice (these are the load-bearing subtleties):
//   • comment awareness (line/block comments may contain the word `end`);
//   • triple-quoted Ohm / expression blobs (their inner `end`/keywords must not count);
//   • the other keywords (defn, defnetwork, …);
//   • truly balanced `end` for nesting.
// Here "end" is recognized only as a line that, trimmed, equals exactly `end`.

import type { Block } from "../core/types.js";
import { ConstructKind } from "../core/enums.js";

export function split(source: string): Block[] {
  const lines = source.split("\n");

  // Per-line start offsets, for Block.offset diagnostics.
  const lineStart: number[] = [];
  let acc = 0;
  for (const line of lines) {
    lineStart.push(acc);
    acc += line.length + 1; // + the consumed "\n"
  }

  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*defrecord\b/.test(lines[i]!)) {
      const start = i;
      let j = i;
      while (j < lines.length && lines[j]!.trim() !== "end") j++;
      const last = Math.min(j, lines.length - 1); // the `end` line (or EOF)
      blocks.push({
        kind: ConstructKind.Record,
        keyword: "defrecord",
        text: lines.slice(start, last + 1).join("\n"),
        offset: lineStart[start]!,
      });
      i = last + 1;
    } else {
      i++; // skip any non-defrecord line (slice 1)
    }
  }
  return blocks;
}
