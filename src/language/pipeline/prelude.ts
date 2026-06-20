// The standard library ("prelude"), supplied to every program at emit time.
//
// `PRELUDE_SOURCE` (the prelude `.tsn` text, in the sibling `prelude-source.ts`) is the prelude
// written IN THE LANGUAGE as ordinary `defn`s — `not`/`and`/`or`, `add`/`sub`/`mul`/`div`, the
// comparison family, and propagatable wrappers over the `math/*` intrinsics. Because slice 4 makes
// the new pipeline compile `defn`, we DOGFOOD the prelude through our own splitter+parser rather
// than re-encode it: the prelude becomes ordinary `FnNode`s, emitted like any user function.
//
// Shadowing: a user definition of the same name WINS — we drop the prelude entry (see `withPrelude`
// below). Injection happens at EMIT time only, so `parseProgram` keeps reporting exactly the user's
// AST (parse/typecheck/diagram see only what was written).
//
// Parsed lazily (memoized) via the lower-level `split` + module `parse` — NOT `index.ts` —
// so there is no import cycle with `emit.ts`, which imports this module.

import { split } from "./split.js";
import { MODULES } from "./registry.js";
import { PRELUDE_SOURCE } from "./prelude-source.js";
import type { AstNode } from "./program.js";

let cached: AstNode[] | null = null;

function preludeNodes(): AstNode[] {
  if (cached === null) {
    cached = split(PRELUDE_SOURCE).map((block) => MODULES[block.kind].parse(block));
  }
  return cached;
}

// Prepend the prelude's nodes (those the program does not itself define) to the program's
// nodes. The user's definitions come last only as rhetoric; names are unique post-filter.
export function withPrelude(nodes: AstNode[]): AstNode[] {
  const taken = new Set(nodes.map((n) => n.name));
  const supplied = preludeNodes().filter((n) => !taken.has(n.name));
  return [...supplied, ...nodes];
}
