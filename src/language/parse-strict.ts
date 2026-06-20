// ── Error-format parity: modular parse that fails like the Lezer front end ──────────
//
// `src/language/index.ts`'s `parseProgram` parses each block and lets the construct
// module's own Ohm failure (`parseRecord: Line 3, col 5: …`, block-relative) bubble up.
// The engine's Lezer `parseProgram` instead throws a single uniform `Syntax error at line
// X, col Y` with positions ABSOLUTE to the whole source. The whole program (operations,
// `check`, Gavagai) reads that exact shape, so the bridge must reproduce it.
//
// This module wraps the per-block parse: on any failure it recovers Ohm's block-relative
// position from the message, translates it to an absolute source position via the block's
// `offset`, and rethrows in the engine's exact format. It reuses `split` + `MODULES` (the
// same machinery `index.ts` uses), so the only added behavior is the error normalization.

import { split } from "./pipeline/split.js";
import { MODULES } from "./pipeline/registry.js";
import type { AstNode, Program } from "./pipeline/program.js";

// 1-based line/col of an absolute char position. Identical to the engine's reporting
// (was a local in tree-to-network.ts); the canonical copy now lives here, on the new
// front end, and the reimplemented choke point imports it.
export function posToLineCol(input: string, pos: number): { line: number; col: number } {
  const lines = input.slice(0, pos).split("\n");
  return { line: lines.length, col: (lines.at(-1)?.length ?? 0) + 1 };
}

// Ohm failure messages begin "Line L, col C:" (block-relative, 1-based). Recover (L,C);
// returns null if the shape is unexpected (then we fall back to the block's start).
function ohmLineCol(message: string): { line: number; col: number } | null {
  const m = /Line (\d+), col (\d+)/.exec(message);
  return m ? { line: Number(m[1]), col: Number(m[2]) } : null;
}

// Absolute char offset of a 1-based (line,col) inside `text`, whose first char is at
// `base` in the original source.
function blockPosToAbsolute(text: string, base: number, line: number, col: number): number {
  const lines = text.split("\n");
  let off = base;
  for (let i = 0; i < line - 1 && i < lines.length; i++) off += lines[i]!.length + 1; // + "\n"
  return off + (col - 1);
}

// The next-anchor splitter silently drops any text BEFORE the first definition keyword
// (content between/after constructs is absorbed into a block and caught by Ohm's full-match;
// only the leading region escapes). The Lezer front end flags such stray text as an error,
// so we must too. Only comments (`// …`) and blank lines are legal there; the first other
// non-whitespace char is the failure position. Returns its source offset, or null.
function leadingGarbagePos(prefix: string): number | null {
  let pos = 0;
  for (const line of prefix.split("\n")) {
    const code = line.split("//")[0]!; // no string literals are legal before a construct
    if (code.trim() !== "") return pos + (code.length - code.trimStart().length);
    pos += line.length + 1; // + the "\n"
  }
  return null;
}

// Parse a program, failing in the engine's exact `Syntax error at line X, col Y` format
// (absolute positions). Behaves like `index.ts`'s `parseProgram` on success.
export function parseProgramStrict(source: string): Program {
  const blocks = split(source);

  // Reject stray text before the first construct (an empty / comment-only source is valid).
  const coveredStart = blocks.length > 0 ? blocks[0]!.offset : source.length;
  const garbage = leadingGarbagePos(source.slice(0, coveredStart));
  if (garbage !== null) {
    const { line, col } = posToLineCol(source, garbage);
    throw new Error(`Syntax error at line ${line}, col ${col}`);
  }

  const nodes: AstNode[] = blocks.map((block) => {
    try {
      return MODULES[block.kind].parse(block);
    } catch (e) {
      const rel = ohmLineCol((e as Error).message ?? "");
      const absPos = rel
        ? blockPosToAbsolute(block.text, block.offset, rel.line, rel.col)
        : block.offset;
      const { line, col } = posToLineCol(source, absPos);
      throw new Error(`Syntax error at line ${line}, col ${col}`);
    }
  });
  return { nodes };
}
