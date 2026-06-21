// Shared Ohm grammar FRAGMENTS + their semantic actions, so the per-construct grammars don't
// re-roll (and drift on) the same lexical and signature surfaces. Each construct's `parse.ts`
// interpolates these strings into its `String.raw` GRAMMAR_SOURCE and spreads the matching
// actions into its semantics — the same pattern `expr/parse.ts` uses for `EXPR_ACTIONS`.

import type { ActionDict } from "ohm-js";
import type { TypeRef, TypedParam, FnSignature } from "../core/types.js";

// The single DECLARATION-name rule, shared by every construct that DECLARES names
// (records/enums/fields, params, derive/parameter/ttable/grammar names): a letter or `_`
// start, then alnum / `_` and the Clojure-ish `?` `!` suffixes.
//
// This is deliberately NOT expr/defnetwork's richer name rule: those additionally allow `/`
// (qualified builtin calls `str/upper`, refs `grammar/Foo`) and live in operator context
// (unary `-`), so they keep their own rule — see `expr/parse.ts`. `/` is the namespace
// separator and must stay out of plain declaration names. (Records/params now accept `_`/`!`,
// fixing the old per-construct drift where a field couldn't be named `bar_baz`.)
export const IDENT_RULES = `
  ident = identStart identCont*
  identStart = letter | "_"
  identCont = alnum | "_" | "?" | "!"
`;

// The fn-style signature (typed params + return type), shared by `defn`/`defllmfn`/`defgrammar`.
// Parametric over the host grammar's `ident` rule (whatever name rule the host defines/inherits).
export const SIGNATURE_RULES = `
  Signature = "signature" ":" "from" Params? "to" TypeRef ";"
  Params = "[" ListOf<Param, ","> "]"
  Param = ident "(" ident ")"
  TypeRef = "[" ident "]"  -- vec
          | ident          -- scalar
`;

// Actions for SIGNATURE_RULES — spread into each host construct's semantics (like EXPR_ACTIONS).
// Produces a `FnSignature` (`{ params, returnType }`); `defn`/`defllmfn` spread it onto the node,
// `defgrammar` stores it as the optional `signature`.
export const SIGNATURE_ACTIONS: ActionDict<unknown> = {
  Signature(_sig, _colon, _from, paramsOpt, _to, typeRef, _semi) {
    const params = paramsOpt.numChildren > 0 ? (paramsOpt.children[0]!.ast() as TypedParam[]) : [];
    return { params, returnType: typeRef.ast() as TypeRef } satisfies FnSignature;
  },
  Params(_lb, list, _rb) {
    return list.asIteration().children.map((c) => c.ast() as TypedParam);
  },
  Param(pred, _lp, bound, _rp) {
    return { predicate: pred.ast() as string, name: bound.ast() as string } satisfies TypedParam;
  },
  TypeRef_vec(_lb, inner, _rb) {
    return { kind: "vector", element: inner.ast() as string } satisfies TypeRef;
  },
  TypeRef_scalar(inner) {
    return { kind: "scalar", predicate: inner.ast() as string } satisfies TypeRef;
  },
};
