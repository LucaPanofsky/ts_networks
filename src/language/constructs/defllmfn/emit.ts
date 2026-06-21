// LlmFnNode → a JS fragment. A `defllmfn` is NOT lowered to source: it emits a single
// `rt.llmFn(node, typeEnv, __reg)` COMPILER call (BUILD) whose result — the memoized async leaf —
// is registered under the bare function name (RUN). The NODE is inlined as-is (single source of
// truth: the runtime reads it as an `LlmFnNode`); the whole-program type environment
// (`ctx.typeEnv()`) is passed as a SEPARATE argument (it's program context the reused engine
// `deriveProtocol` needs for the structured-output schema, not part of the llmfn's own AST).
// Config (model) rides in the node's `with:` data; the API key stays ambient and is never emitted.

import type { EmitCtx } from "../../core/module.js";
import { typeRefToString } from "../../core/types.js";
import type { LlmFnNode } from "./ast.js";

export function emitLlmFn(node: LlmFnNode, ctx: EmitCtx): string {
  const local = ctx.mangle(node.name);
  const q = JSON.stringify;
  const from = node.params.map((p) => p.predicate);
  const to = typeRefToString(node.returnType);
  return [
    `const ${local} = ${ctx.rt}.llmFn(${q(node)}, ${q(ctx.typeEnv())}, __reg);`,
    `__reg.register(${q(node.name)}, { arity: ${node.params.length}, impl: ${local}, morphism: { from: ${q(from)}, to: ${q(to)} } });`,
  ].join("\n");
}
