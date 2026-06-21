// A TTable is a HEAVY construct: it emits a thin `rt.ttable(spec, record, resolve)` call
// (the runtime function is the COMPILER) and registers the result as `TTable/<name>`
// (text → [Row?]). The row record's descriptor is INLINED via `ctx.record` so the reused
// `compileTTable` can build rows; the constructor stays late-bound through `__reg.resolve`.

import type { EmitCtx } from "../../core/module.js";
import type { TTableNode } from "./ast.js";

export function emitTTable(node: TTableNode, ctx: EmitCtx): string {
  const key = `TTable/${node.name}`;
  const local = ctx.mangle(key);
  const record = ctx.record(node.row);
  const q = JSON.stringify;
  return [
    `const ${local} = ${ctx.rt}.ttable(${q(node)}, ${q(record)}, __reg.resolve);`,
    `__reg.register(${q(key)}, { arity: ${local}.arity, impl: ${local}.impl, morphism: { from: ${q(["String?"])}, to: ${q(`[${node.row}?]`)} } });`,
  ].join("\n");
}
