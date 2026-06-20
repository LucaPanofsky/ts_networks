// The node `defn` produces — a pure verb: typed params, a return type, and a body.
// (A `defpredicate` is the same shape with isPredicate = true and a Boolean return; it
// will likely be a thin variant of this module rather than its own.)

import type { TypeRef } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";

export type TypedParam = {
  predicate: string;
  name: string;
};

// The expression sub-language is itself a grammar. For the sketch the body is kept as
// raw source text; promoting it to a real Expr AST (literal/var/call/binary/let/match/
// interpolate, as in the current pipeline) is a later, self-contained slice.
export type ExprNode = { kind: "raw"; source: string };

export type FnNode = {
  kind: ConstructKind.Fn;
  isPredicate: boolean;
  name: string;
  params: TypedParam[];
  returnType: TypeRef;
  body: ExprNode;
};
