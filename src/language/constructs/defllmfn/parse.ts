// block text → LlmFnNode, via Ohm. Only the SHELL is parsed (keyword, fn-style signature,
// optional `with:` config, the triple-quoted prompt clauses, `end`); the prompt bodies are
// opaque text captured verbatim and rendered at RUN time by `callLLMFn`. The Ohm grammar
// below is the single source (there is no separate `.ohm` file).

import { grammar as ohmGrammar, type ActionDict } from "ohm-js";
import type { Block, TypeRef, TypedParam } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";
import type { LlmFnNode } from "./ast.js";

const GRAMMAR_SOURCE = String.raw`
Llmfn {
  Main = "defllmfn" ident Signature With? Clause+ "end"
  Signature = "signature" ":" "from" Params? "to" TypeRef ";"
  Params = "[" ListOf<Param, ","> "]"
  Param = ident "(" ident ")"
  TypeRef = "[" ident "]"  -- vec
          | ident          -- scalar
  With = "with" ":" ListOf<ConfigPair, ","> ";"
  ConfigPair = ident "=" ConfigVal
  ConfigVal = string   -- str
            | number   -- num
            | ident    -- word
  Clause = "system" tripleString ";"  -- system
         | "user" tripleString ";"    -- user
         | tripleString ";"           -- bare
  string = "'" (~"'" any)* "'"
  number = "-"? digit+ ("." digit+)?
  tripleString = "\"\"\"" (~"\"\"\"" any)* "\"\"\""
  ident = letter identChar*
  identChar = alnum | "?" | "_"
}
`;

type Clause = { channel: "system" | "user"; text: string };

const g = ohmGrammar(GRAMMAR_SOURCE);
const semantics = g.createSemantics().addOperation<unknown>("ast", {
  Main(_kw, name, sig, withOpt, clauses, _end) {
    const s = sig.ast() as { params: TypedParam[]; returnType: TypeRef };
    const config = withOpt.numChildren > 0 ? (withOpt.children[0]!.ast() as Record<string, string>) : {};
    // The clause channels carry order-flexibility: the LAST `user`/bare block wins for
    // `user`, the `system` block (if any) for `system` — mirroring the engine collector.
    let user = "";
    let system: string | undefined;
    for (const child of clauses.children) {
      const cl = child.ast() as Clause;
      if (cl.channel === "system") system = cl.text;
      else user = cl.text;
    }
    const node: LlmFnNode = {
      kind: ConstructKind.Llmfn,
      name: name.ast() as string,
      params: s.params,
      returnType: s.returnType,
      user,
      config,
    };
    // Only attach `system` when present (a bare/user-only llmfn has none); the oracle's
    // `system: undefined` deep-equals the omitted key.
    if (system !== undefined) node.system = system;
    return node;
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
  With(_with, _colon, list, _semi) {
    const pairs = list.asIteration().children.map((c) => c.ast() as [string, string]);
    return Object.fromEntries(pairs);
  },
  ConfigPair(key, _eq, val) {
    return [key.ast() as string, val.ast() as string];
  },
  // String config values lose their quotes (matching the engine); numbers/barewords are
  // kept verbatim (e.g. `max_tokens` may be written `4096` or `'4096'` — both stored as text).
  ConfigVal_str(s) {
    return s.ast() as string;
  },
  ConfigVal_num(n) {
    return n.sourceString;
  },
  ConfigVal_word(id) {
    return id.ast() as string;
  },
  Clause_system(_kw, ts, _semi) {
    return { channel: "system", text: ts.ast() as string } satisfies Clause;
  },
  Clause_user(_kw, ts, _semi) {
    return { channel: "user", text: ts.ast() as string } satisfies Clause;
  },
  Clause_bare(ts, _semi) {
    return { channel: "user", text: ts.ast() as string } satisfies Clause;
  },
  string(_open, inner, _close) {
    return inner.sourceString;
  },
  tripleString(_open, inner, _close) {
    return inner.sourceString.trim();
  },
  ident(_first, _rest) {
    return this.sourceString;
  },
} as ActionDict<unknown>);

export function parseLlmFn(block: Block): LlmFnNode {
  const m = g.match(block.text, "Main");
  if (m.failed()) {
    throw new Error(`parseLlmFn: ${m.message ?? "no match"}`);
  }
  return semantics(m).ast() as LlmFnNode;
}
