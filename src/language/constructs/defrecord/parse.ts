// block text → RecordNode, via Ohm. The grammar source below is the live copy; the
// readable canonical copy is grammar.ohm (kept in sync by hand — .ohm files are not
// importable under NodeNext/jest, so the string here is what runs).
//
// Uppercase rules are syntactic (Ohm skips whitespace between their terms), which is how
// indentation/newlines between the keyword, fields and `end` are handled; `ident` is
// lexical so a name/predicate is matched contiguously (and may carry a trailing `?`).

import { grammar as ohmGrammar } from "ohm-js";
import type { Block } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import type { TypeRef } from "../../core/types.js";
import type { FieldDecl, RecordNode } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
Record {
  Main  = "defrecord" ident Field* "end"
  Field = ident ":" Type ";"
  Type  = "[" ident "]"  -- vector
        | ident          -- scalar
  ident = letter identChar*
  identChar = alnum | "?"
}
`;

const g = ohmGrammar(GRAMMAR_SOURCE);
const semantics = g.createSemantics().addOperation<unknown>("ast", {
  Main(_kw, name, fields, _end) {
    return {
      kind: ConstructKind.Record,
      name: name.ast() as string,
      fields: fields.children.map((c) => c.ast() as FieldDecl),
    } satisfies RecordNode;
  },
  Field(fname, _colon, type, _semi) {
    return { name: fname.ast() as string, type: type.ast() as TypeRef } satisfies FieldDecl;
  },
  Type_vector(_lb, inner, _rb) {
    return { kind: "vector", element: inner.ast() as string } satisfies TypeRef;
  },
  Type_scalar(inner) {
    return { kind: "scalar", predicate: inner.ast() as string } satisfies TypeRef;
  },
  ident(_first, _rest) {
    return this.sourceString;
  },
});

export function parseRecord(block: Block): RecordNode {
  const m = g.match(block.text);
  if (m.failed()) {
    throw new Error(`parseRecord: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as RecordNode;
}
