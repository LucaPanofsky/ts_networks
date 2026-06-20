// A network emits a DATA literal + a runtime call — it does NOT inline the propagation
// engine. Referenced leaves (fns, grammars, other networks) resolve by name through the
// registry (late binding), which is what `ctx.ref` / `__reg.resolve` is for. Stub.
// Shape of the intended output:
//
//   const rectangleMetrics = rt.network(
//     { signature: { from: ["rect"], to: "area" },
//       terms: [ { kind: "propagate", fn: "rectangleArea", from: ["rect"], to: "area" } ] },
//     __reg.resolve);
//   __reg.register("network/rectangleMetrics", { arity: 1, impl: rectangleMetrics,
//     morphism: { from: ["rect"], to: "area" } });

import type { EmitCtx } from "../../core/module.js";
import type { NetworkNode } from "./ast.js";

export function emitNetwork(_node: NetworkNode, ctx: EmitCtx): string {
  void ctx; // the real implementation uses ctx.rt (the runtime call) + ctx.ref (leaves)
  throw new Error("emitNetwork: not implemented (sketch)");
}
