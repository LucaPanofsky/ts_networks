// A network emits a DATA literal (its spec) + a single `rt.network(spec, __reg)` COMPILER
// call — it does NOT inline the propagation engine. The adapter reuses the engine's
// astToDataNetwork + NetworkRuntime, building the runtime lazily on first invoke; referenced
// leaves (fns, grammars, other networks) are resolved by name through the registry, so emit
// order is irrelevant (a network may be emitted before its leaves). The whole `__reg` is
// passed (not just `resolve`) because NetworkRuntime needs the engine registry — impl AND
// arity per leaf — which `__reg.backing` exposes.
//
//   const rectangleMetrics = rt.network(
//     { kind: "network", name: "rectangleMetrics",
//       signature: { from: ["rect"], to: "area" },
//       terms: [ { kind: "propagate", fn: "rectangleArea", from: ["rect"], to: "area", params: {} } ] },
//     __reg);
//   __reg.register("network/rectangleMetrics", { arity: 1, impl: rectangleMetrics,
//     morphism: { from: ["Any?"], to: "Any?" } });

import type { EmitCtx } from "../../core/module.js";
import type { NetworkNode } from "./ast.js";

export function emitNetwork(node: NetworkNode, ctx: EmitCtx): string {
  const local = ctx.mangle(node.name);
  const key = `network/${node.name}`;
  const from = node.signature.from;
  const q = JSON.stringify;
  return [
    `const ${local} = ${ctx.rt}.network(${q(node)}, __reg);`,
    // Networks declare no cell types, so the morphism is permissive (mirrors buildNetworks).
    `__reg.register(${q(key)}, { arity: ${from.length}, impl: ${local}, morphism: { from: ${q(from.map(() => "Any?"))}, to: "Any?" } });`,
  ].join("\n");
}
