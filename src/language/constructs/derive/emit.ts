// A derive emits NO runtime artifact — only a documenting comment. It is a type-level
// declaration the engine consumes nowhere yet (subsumption is a future slice; touching the
// merge algebra is off-limits). Carrying the node + emitting a comment keeps the program
// faithful (the derive is no longer silently dropped) without inventing runtime semantics.

import type { EmitCtx } from "../../core/module.js";
import type { DeriveNode } from "./ast.js";

export function emitDerive(node: DeriveNode, _ctx: EmitCtx): string {
  return `// derive ${node.sub} <: ${node.sup} — type-level declaration; no runtime emission.`;
}
