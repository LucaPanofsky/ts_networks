// block text → GrammarNode, via Ohm. The grammar SHELL (keyword, optional signature, the
// triple-quoted body, `end`) is parsed here; the body itself is opaque Ohm source captured
// verbatim and handed to the runtime (which compiles it with the reused `compileGrammar`).
// The grammar source below is the live copy; grammar.ohm is the readable canonical copy
// (kept in sync by hand — .ohm files are not importable under NodeNext/jest).

import { grammar as ohmGrammar } from "ohm-js";
import type { Block } from "../../core/types.js";
import type { TypeRef } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import type { GrammarNode, GrammarSignature } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
Grammar {
  Main = "defgrammar" ident Signature? tripleString "end"
  Signature = "signature" ":" "from" Params? "to" TypeRef ";"
  Params = "[" ListOf<Param, ","> "]"
  Param = ident "(" ident ")"
  TypeRef = "[" ident "]"  -- vec
          | ident          -- scalar
  tripleString = "\"\"\"" (~"\"\"\"" any)* "\"\"\""
  ident = letter identChar*
  identChar = alnum | "?"
}
`;

const g = ohmGrammar(GRAMMAR_SOURCE);
const semantics = g.createSemantics().addOperation<unknown>("ast", {
  Main(_kw, name, sigOpt, body, _end) {
    const signature = sigOpt.numChildren > 0 ? (sigOpt.children[0]!.ast() as GrammarSignature) : undefined;
    return {
      kind: ConstructKind.Grammar,
      name: name.ast() as string,
      source: body.ast() as string,
      signature,
    } satisfies GrammarNode;
  },
  Signature(_sig, _colon, _from, paramsOpt, _to, typeRef, _semi) {
    const params = paramsOpt.numChildren > 0 ? (paramsOpt.children[0]!.ast() as { predicate: string; name: string }[]) : [];
    return { params, returnType: typeRef.ast() as TypeRef } satisfies GrammarSignature;
  },
  Params(_lb, list, _rb) {
    return list.asIteration().children.map((c) => c.ast() as { predicate: string; name: string });
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
  tripleString(_open, inner, _close) {
    return inner.sourceString.trim();
  },
  ident(_first, _rest) {
    return this.sourceString;
  },
});

export function parseGrammar(block: Block): GrammarNode {
  const m = g.match(block.text);
  if (m.failed()) {
    throw new Error(`parseGrammar: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as GrammarNode;
}
