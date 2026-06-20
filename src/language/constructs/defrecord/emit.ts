// A record emits PURE JS — it needs nothing from the runtime but the registry. One
// node contributes several bindings: a constructor, a predicate, and one accessor per
// field. (Illustrative of the pure path; the morphisms are first-cut.)

import type { EmitCtx } from "../../core/module.js";
import { typeRefToString } from "../../core/types.js";
import type { RecordNode } from "./ast.js";

export function emitRecord(node: RecordNode, ctx: EmitCtx): string {
  const ctor = ctx.mangle(node.name);
  const pred = ctx.mangle(`${node.name}?`);
  const params = node.fields.map((f) => f.name);
  const from = node.fields.map((f) => typeRefToString(f.type));
  const q = JSON.stringify;

  const lines = [
    // constructor
    `const ${ctor} = (${params.join(", ")}) => ({ __type: ${q(node.name)}, ${params.join(", ")} });`,
    `__reg.register(${q(node.name)}, { arity: ${params.length}, impl: ${ctor}, morphism: { from: ${q(from)}, to: ${q(`${node.name}?`)} } });`,
    // predicate — registered as a leaf (a new-pipeline choice; the existing engine keeps
    // it out of the registry). The { Any? → Boolean? } morphism is a placeholder until
    // the type-checker slice supplies real morphisms.
    `const ${pred} = (v) => v != null && v.__type === ${q(node.name)};`,
    `__reg.register(${q(`${node.name}?`)}, { arity: 1, impl: ${pred}, morphism: { from: ["Any?"], to: "Boolean?" } });`,
  ];
  // accessors — one per field. Emitted INLINE (no `const Name.field` binding: `.` is not
  // a legal identifier char and mangle does not rewrite it). The registry key stays the
  // unmangled `Name.field`, matching the existing engine.
  for (const f of node.fields) {
    lines.push(
      `__reg.register(${q(`${node.name}.${f.name}`)}, { arity: 1, impl: (r) => r.${f.name}, morphism: { from: ${q([`${node.name}?`])}, to: ${q(typeRefToString(f.type))} } });`,
    );
  }
  return lines.join("\n");
}
