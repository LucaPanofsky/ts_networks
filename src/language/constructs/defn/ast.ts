// The node `defn` produces — a pure verb: typed params, a return type, and a body.
// (A `defpredicate` is the same shape with isPredicate = true and a Boolean return; it
// will likely be a thin variant of this module rather than its own.)

import type { TypeRef, TypedParam } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
// The expression body REUSES the existing `Expr` AST so the existing `compileExpr` can
// be reused verbatim (the Expr AST is the contract; only the parser changed Lezer→Ohm).
import type { Expr } from "../../../data-network/types.js";

export type FnNode = {
  kind: ConstructKind.Fn;
  isPredicate: boolean;
  name: string;
  params: TypedParam[];
  returnType: TypeRef;
  body: Expr;
};
