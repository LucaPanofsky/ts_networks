// block text → FnNode. The shell grammar INHERITS the shared expression grammar
// (`TsnDefn <: TsnExpr`) so the body is parsed STRUCTURALLY via the inherited `ExprBody`
// rule — a `match … end` inside the body is therefore not mistaken for the `defn`'s own
// `end`. The body's `Expr` is built by the reused expression actions (spread in below).
//
// Scope: `expression` bodies only this slice. `interpolate` bodies are not yet matched
// (they fail parse with a clear error) — deferred until the `__interp` runtime helper.

import { grammar as ohmGrammar, type ActionDict } from "ohm-js";
import type { Block } from "../../core/types.js";
import type { TypeRef } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import type { Expr } from "../../../data-network/types.js";
import { exprGrammar, EXPR_ACTIONS } from "../../expr/parse.js";
import type { FnNode, TypedParam } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
TsnDefn <: TsnExpr {
  Main = "defn" ident Signature "expression" ExprBody "end"
  Signature = "signature" ":" "from" Params? "to" TypeRef ";"
  Params = "[" ListOf<Param, ","> "]"
  Param = ident "(" ident ")"
  TypeRef = "[" ident "]"  -- vec
          | ident          -- scalar
}
`;

const g = ohmGrammar(GRAMMAR_SOURCE, { TsnExpr: exprGrammar });

const DEFN_ACTIONS: ActionDict<unknown> = {
  ...EXPR_ACTIONS,
  Main(_defn, name, sig, _expr, body, _end) {
    const s = sig.ast() as { params: TypedParam[]; returnType: TypeRef };
    return {
      kind: ConstructKind.Fn,
      isPredicate: false,
      name: name.ast() as string,
      params: s.params,
      returnType: s.returnType,
      body: body.ast() as Expr,
    } satisfies FnNode;
  },
  Signature(_sig, _colon, _from, paramsOpt, _to, typeRef, _semi) {
    const params = paramsOpt.numChildren > 0 ? (paramsOpt.children[0]!.ast() as TypedParam[]) : [];
    return { params, returnType: typeRef.ast() as TypeRef };
  },
  Params(_lb, list, _rb) {
    return list.asIteration().children.map((c) => c.ast() as TypedParam);
  },
  Param(pred, _lp, bound, _rp) {
    return { predicate: pred.ast() as string, name: bound.ast() as string };
  },
  TypeRef_vec(_lb, inner, _rb) {
    return { kind: "vector", element: inner.ast() as string } satisfies TypeRef;
  },
  TypeRef_scalar(inner) {
    return { kind: "scalar", predicate: inner.ast() as string } satisfies TypeRef;
  },
};

const semantics = g.createSemantics().addOperation<unknown>("ast", DEFN_ACTIONS);

export function parseFn(block: Block): FnNode {
  const m = g.match(block.text, "Main");
  if (m.failed()) {
    throw new Error(`parseFn: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as FnNode;
}
