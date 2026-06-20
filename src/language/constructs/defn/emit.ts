// A fn emits PURE JS: its body lowered by the REUSED `compileExpr` (Expr → JS string),
// wrapped as an arrow and registered. The `const` binding (module scope) is what lets
// other emitted fragments call it by bare name — `compileExpr` emits bare mangled
// identifiers for calls/vars (the existing-sandbox model); the registry entry is the
// external/propagator interface.

import type { EmitCtx } from "../../core/module.js";
import { typeRefToString } from "../../core/types.js";
import { compileExpr } from "../../expr/index.js";
import type { FnNode } from "./ast.js";

export function emitFn(node: FnNode, ctx: EmitCtx): string {
  const name = ctx.mangle(node.name);
  const params = node.params.map((p) => p.name);
  const from = node.params.map((p) => p.predicate);
  const to = typeRefToString(node.returnType);
  const q = JSON.stringify;
  return [
    `const ${name} = (${params.join(", ")}) => ${compileExpr(node.body)};`,
    `__reg.register(${q(node.name)}, { arity: ${params.length}, impl: ${name}, morphism: { from: ${q(from)}, to: ${q(to)} } });`,
  ].join("\n");
}
