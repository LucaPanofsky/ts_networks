// The node `defgrammar` produces — a named Ohm grammar carried as verbatim source, with
// an optional signature binding the parse result to a record. Shaped to MIRROR the engine's
// `GrammarAST` (`src/data-network/types.ts`) — `kind` is the string "grammar" either way —
// so the runtime adapter casts it straight through to the reused `compileGrammar`.
//
// A scalar `to Rec?` parses the whole input into one record; a vector `to [Rec?]` scans for
// all embedded matches; no signature is a bare recognizer returning the matched text.

import type { TypeRef } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";

export type GrammarSignature = {
  params: { predicate: string; name: string }[];
  returnType: TypeRef;
};

export type GrammarNode = {
  kind: ConstructKind.Grammar;
  name: string;
  source: string;
  signature?: GrammarSignature;
};
