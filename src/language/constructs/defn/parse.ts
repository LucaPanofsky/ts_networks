// block text → FnNode. The shell grammar INHERITS the shared expression grammar
// (`TsnDefn <: TsnExpr`) so the body is parsed STRUCTURALLY via the inherited `ExprBody`
// rule — a `match … end` inside the body is therefore not mistaken for the `defn`'s own
// `end`. The body's `Expr` is built by the reused expression actions (spread in below).
//
// Two body forms: `expression <Expr>` and `interpolate """..."""` (the latter lowered to
// the `__interp` runtime helper by `compileExpr`).

import { grammar as ohmGrammar, type ActionDict } from "ohm-js";
import type { Block } from "../../core/types.js";
import type { TypeRef } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import type { Expr } from "../../../data-network/types.js";
import { exprGrammar, EXPR_ACTIONS } from "../../expr/parse.js";
import type { FnNode } from "./ast.js";
import type { TypedParam } from "../../core/types.js";

const GRAMMAR_SOURCE = String.raw`
TsnDefn <: TsnExpr {
  Main = defKw ident Signature Body "end"
  defKw = "defpredicate" | "defn"
  Body = "expression" ExprBody          -- expr
       | "interpolate" tripleString ";" -- interp
  tripleString = "\"\"\"" (~"\"\"\"" any)* "\"\"\""
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
  Main(kw, name, sig, body, _end) {
    const s = sig.ast() as { params: TypedParam[]; returnType: TypeRef };
    return {
      kind: ConstructKind.Fn,
      // `defpredicate` and `defn` share this module — the keyword is the only difference.
      // The flag is emit-irrelevant today (a predicate compiles like any fn); it carries
      // the distinction the type-checker will need (known-predicate set, `as filtering`).
      isPredicate: kw.sourceString === "defpredicate",
      name: name.ast() as string,
      params: s.params,
      returnType: s.returnType,
      body: body.ast() as Expr,
    } satisfies FnNode;
  },
  // `expression` → the inherited expression body; `interpolate` → an InterpolateExpr (part
  // of the `Expr` union) carrying the trimmed template. `compileExpr` lowers it to the
  // `__interp(...)` call the runtime backs — emit needs no special case.
  Body_expr(_expr, exprBody) {
    return exprBody.ast() as Expr;
  },
  Body_interp(_interp, template, _semi) {
    return { kind: "interpolate", template: template.ast() as string } satisfies Expr;
  },
  tripleString(_open, inner, _close) {
    return inner.sourceString.trim();
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
