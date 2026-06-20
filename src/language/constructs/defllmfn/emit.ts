// LlmFnNode → a JS fragment. A `defllmfn` is NOT lowered to source: it emits a single
// `rt.llmFn(spec, __reg)` COMPILER call (BUILD) whose result — the memoized async leaf — is
// registered under the bare function name (RUN). The spec inlines the node plus the
// program's type environment (`ctx.typeEnv()`), so the reused engine `deriveProtocol` can
// build the model's structured-output schema. Config (model) rides in the spec's `with:`
// data; the API key stays ambient (env) and is never emitted. See core/runtime-api.ts.

import type { EmitCtx } from "../../core/module.js";
import { typeRefToString } from "../../core/types.js";
import type { LlmFnNode } from "./ast.js";

export function emitLlmFn(node: LlmFnNode, ctx: EmitCtx): string {
  const local = ctx.mangle(node.name);
  const q = JSON.stringify;
  // The inlined spec = the node + the whole-program type environment the protocol needs.
  const spec = {
    kind: node.kind,
    name: node.name,
    params: node.params,
    returnType: node.returnType,
    user: node.user,
    ...(node.system !== undefined ? { system: node.system } : {}),
    config: node.config,
    typeEnv: ctx.typeEnv(),
  };
  const from = node.params.map((p) => p.predicate);
  const to = typeRefToString(node.returnType);
  return [
    `const ${local} = ${ctx.rt}.llmFn(${q(spec)}, __reg);`,
    `__reg.register(${q(node.name)}, { arity: ${node.params.length}, impl: ${local}, morphism: { from: ${q(from)}, to: ${q(to)} } });`,
  ].join("\n");
}
