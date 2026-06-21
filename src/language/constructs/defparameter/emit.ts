// A defparameter emits NO runtime artifact — only a documenting comment. It is a network
// INPUT declaration the engine consumes nowhere yet (run-wiring / cell-seeding is a future
// slice tied to defnetwork + the `run` entry point). Carrying the node + emitting a comment
// keeps the program faithful (the parameter is no longer silently dropped) without inventing
// runtime semantics or a registry entry.

import type { EmitCtx } from "../../core/module.js";
import { typeRefToString } from "../../core/types.js";
import type { ParameterNode } from "./ast.js";

export function emitParameter(node: ParameterNode, _ctx: EmitCtx): string {
  return `// defparameter ${node.name} : ${typeRefToString(node.type)} — network input; parse+carry only, no runtime emission (seeding lands with defnetwork + run).`;
}
