// The node `defgrammar` produces — a named Ohm grammar carried as verbatim source, with
// an optional signature binding the parse result to a record. This is the SINGLE grammar AST
// (the engine `GrammarAST` twin was removed): the reused `compileGrammar` consumes it directly
// (the runtime adapter structurally casts the inlined spec to it).
//
// A scalar `to Rec?` parses the whole input into one record; a vector `to [Rec?]` scans for
// all embedded matches; no signature is a bare recognizer returning the matched text.

import type { FnSignature } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";

export type GrammarNode = {
  kind: ConstructKind.Grammar;
  name: string;
  source: string;
  signature?: FnSignature;
};
