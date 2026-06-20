// The one shared parser concern: chunk source into definition blocks and tag each with
// its construct kind. Each module then parses an already-isolated block, so the
// per-construct grammars never have to compose.
//
// Design: NEXT-ANCHOR, not end-counting. A construct's region runs from its keyword line
// to the line where the *next* top-level definition begins (or EOF). This sidesteps
// `end`-balancing entirely — `defextract`'s nested `within … end` blocks and `derive`'s
// lack of an `end` need no special handling, because we never count `end`s.
//
// The load-bearing subtlety is blob/string/comment state: a line inside a `"""` blob, or
// a `//` inside a `'…'` string, must not be read as a keyword or a comment. This is
// handled by `scanLine`, a small char scanner whose state (in-blob) threads across lines.
//
// Implementation is functional: `scanLine` is pure (state in, stripped line + state out),
// `classify` is a fold threading that state, `toBlocks` is a pure transform.

import type { Block } from "../core/types.js";
import { KEYWORD_TO_KIND, DEFINITION_KEYWORDS } from "../core/enums.js";

const ANCHOR_RE = new RegExp(`^\\s*(${DEFINITION_KEYWORDS.join("|")})\\b`);

// One line, scanned char by char carrying blob state. Strips `//` line-comments that are
// outside a blob and outside a single-quoted string; preserves everything inside `"""`
// blobs and `'…'` literals (so a `//` in `'http://x'` or in Ohm source survives).
function scanLine(line: string, inBlob: boolean): { stripped: string; inBlob: boolean } {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (inBlob) {
      if (line.startsWith('"""', i)) {
        inBlob = false;
        out += '"""';
        i += 3;
      } else {
        out += line[i];
        i += 1;
      }
      continue;
    }
    if (line.startsWith('"""', i)) {
      inBlob = true;
      out += '"""';
      i += 3;
    } else if (line[i] === "'") {
      // copy a single-quoted literal verbatim through its closing quote (or EOL)
      out += "'";
      i += 1;
      while (i < line.length && line[i] !== "'") {
        out += line[i];
        i += 1;
      }
      if (i < line.length) {
        out += "'";
        i += 1;
      }
    } else if (line.startsWith("//", i)) {
      break; // comment to end of line — drop the rest
    } else {
      out += line[i];
      i += 1;
    }
  }
  return { stripped: out, inBlob };
}

type LineInfo = {
  stripped: string;
  isAnchor: boolean;
  keyword: string | null;
  offset: number; // char offset of this line in the ORIGINAL source
};

// Fold over the lines, threading blob state. Anchoring uses the blob state at the START
// of the line, so a line that opens a blob (e.g. `defn … interpolate """`) can still be
// an anchor.
function classify(lines: string[]): LineInfo[] {
  const infos: LineInfo[] = [];
  let inBlob = false;
  let offset = 0;
  for (const line of lines) {
    const inBlobAtStart = inBlob;
    const { stripped, inBlob: inBlobAtEnd } = scanLine(line, inBlob);
    const m = inBlobAtStart ? null : ANCHOR_RE.exec(stripped);
    infos.push({
      stripped,
      isAnchor: m !== null,
      keyword: m ? m[1]! : null,
      offset,
    });
    inBlob = inBlobAtEnd;
    offset += line.length + 1; // + the "\n" that split consumed
  }
  return infos;
}

// Pair each anchor with the next anchor (or EOF) to form a region, trim trailing blank
// lines so the region ends at the construct's terminator, and emit a Block only for
// keywords that have a module (KEYWORD_TO_KIND). Other definitions are boundaries only.
function toBlocks(infos: LineInfo[]): Block[] {
  const anchorIdx = infos
    .map((info, i) => (info.isAnchor ? i : -1))
    .filter((i) => i >= 0);

  const blocks: Block[] = [];
  for (let a = 0; a < anchorIdx.length; a++) {
    const start = anchorIdx[a]!;
    const end = a + 1 < anchorIdx.length ? anchorIdx[a + 1]! : infos.length; // exclusive

    const keyword = infos[start]!.keyword!;
    const kind = KEYWORD_TO_KIND[keyword];
    if (kind === undefined) continue; // unimplemented construct → boundary only

    // trim trailing blank lines (comment-only lines are now blank after stripping)
    let last = end - 1;
    while (last > start && infos[last]!.stripped.trim() === "") last -= 1;

    const text = infos
      .slice(start, last + 1)
      .map((info) => info.stripped)
      .join("\n");

    blocks.push({ kind, keyword, text, offset: infos[start]!.offset });
  }
  return blocks;
}

export function split(source: string): Block[] {
  return toBlocks(classify(source.split("\n")));
}
