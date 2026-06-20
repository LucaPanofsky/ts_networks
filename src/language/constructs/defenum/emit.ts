// An enum emits PURE JS — a single membership predicate, registered as `Name?`. No
// constructor and no values binding: enum values are bare strings elsewhere, and `Name?`
// validates membership. Mirrors the predicate half of defrecord/emit.ts. The
// { Any? → Boolean? } morphism is a placeholder until the type-checker slice.

import type { EmitCtx } from "../../core/module.js";
import type { EnumNode } from "./ast.js";

export function emitEnum(node: EnumNode, ctx: EmitCtx): string {
  const pred = ctx.mangle(`${node.name}?`);
  const q = JSON.stringify;
  return [
    `const ${pred} = (v) => ${q(node.values)}.includes(v);`,
    `__reg.register(${q(`${node.name}?`)}, { arity: 1, impl: ${pred}, morphism: { from: ["Any?"], to: "Boolean?" } });`,
  ].join("\n");
}
