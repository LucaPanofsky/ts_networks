// block text → FnNode, via grammar.ohm. (Sketch.)

import type { Block } from "../../core/types.js";
import type { FnNode } from "./ast.js";

export function parseFn(_block: Block): FnNode {
  throw new Error("parseFn: not implemented (sketch)");
}
