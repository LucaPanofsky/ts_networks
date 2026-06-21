// A record emits PURE JS — it needs nothing from the runtime but the registry. One
// node contributes several bindings: a constructor, a predicate, and one accessor per
// field. (Illustrative of the pure path; the morphisms are first-cut.)

import type { EmitCtx } from "../../core/module.js";
import { typeRefToString } from "../../core/types.js";
import type { RecordNode } from "./ast.js";

export function emitRecord(node: RecordNode, ctx: EmitCtx): string {
  const ctor = ctx.mangle(node.name);
  const pred = ctx.mangle(`${node.name}?`);
  const from = node.fields.map((f) => typeRefToString(f.type));
  const q = JSON.stringify;

  // The constructor takes POSITIONAL params (`_0`, `_1`, …) and writes each field under its
  // QUOTED raw name, so a field whose name is not a legal JS identifier (e.g. `ok?`, a kebab
  // name, or a reserved word) emits valid JS while the stored DATA KEY stays the raw field name
  // (output JSON / schema property names are unchanged). Called positionally everywhere
  // (grammar-runtime `buildRecord`, cell exprs), so positional params are safe.
  const params = node.fields.map((_, i) => `_${i}`);
  const fieldsObj = node.fields.map((f, i) => `${q(f.name)}: _${i}`).join(", ");
  const obj = fieldsObj ? `{ __type: ${q(node.name)}, ${fieldsObj} }` : `{ __type: ${q(node.name)} }`;

  const lines = [
    // constructor
    `const ${ctor} = (${params.join(", ")}) => (${obj});`,
    `__reg.register(${q(node.name)}, { arity: ${node.fields.length}, impl: ${ctor}, morphism: { from: ${q(from)}, to: ${q(`${node.name}?`)} } });`,
    // predicate — registered as a leaf (a new-pipeline choice; the existing engine keeps
    // it out of the registry). The { Any? → Boolean? } morphism is a placeholder until
    // the type-checker slice supplies real morphisms.
    `const ${pred} = (v) => v != null && v.__type === ${q(node.name)};`,
    `__reg.register(${q(`${node.name}?`)}, { arity: 1, impl: ${pred}, morphism: { from: ["Any?"], to: "Boolean?" } });`,
  ];
  // accessors — one per field. Emitted INLINE (no `const Name.field` binding: `.` is not a
  // legal identifier char). The field is read by its QUOTED raw name (`r["ok?"]`) so special-
  // char fields work; the registry key stays the unmangled `Name.field`, matching the engine.
  for (const f of node.fields) {
    lines.push(
      `__reg.register(${q(`${node.name}.${f.name}`)}, { arity: 1, impl: (r) => r[${q(f.name)}], morphism: { from: ${q([`${node.name}?`])}, to: ${q(typeRefToString(f.type))} } });`,
    );
  }
  return lines.join("\n");
}
