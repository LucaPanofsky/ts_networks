// A grammar is a HEAVY construct: it emits a thin `rt.grammar(spec, record, resolve)` call
// (the runtime function is the COMPILER, run at module-eval time) and registers the result.
// The spec is the node itself (it doubles as the engine's GrammarAST); the bound record's
// descriptor is INLINED via `ctx.record` so the reused `compileGrammar` can build it, while
// the constructor stays late-bound through `__reg.resolve`.

import type { EmitCtx } from "../../core/module.js";
import { typeRefToString } from "../../core/types.js";
import type { GrammarNode } from "./ast.js";

// The record a signed grammar binds: a scalar `to Rec?` names it, a vector `to [Rec?]` its
// element (?-stripped). A bare recognizer (no signature) binds nothing.
function boundRecordName(node: GrammarNode): string | null {
  if (!node.signature) return null;
  const rt = node.signature.returnType;
  const pred = rt.kind === "vector" ? rt.element : rt.predicate;
  return pred.endsWith("?") ? pred.slice(0, -1) : pred;
}

export function emitGrammar(node: GrammarNode, ctx: EmitCtx): string {
  const key = `grammar/${node.name}`;
  const local = ctx.mangle(key);
  const recName = boundRecordName(node);
  const record = recName ? ctx.record(recName) : undefined;
  const from = node.signature ? node.signature.params.map((p) => p.predicate) : ["String?"];
  const to = node.signature ? typeRefToString(node.signature.returnType) : "String?";
  const q = JSON.stringify;
  return [
    `const ${local} = ${ctx.rt}.grammar(${q(node)}, ${q(record)}, __reg.resolve);`,
    `__reg.register(${q(key)}, { arity: ${local}.arity, impl: ${local}.impl, scan: ${local}.scan, morphism: { from: ${q(from)}, to: ${q(to)} } });`,
  ].join("\n");
}
