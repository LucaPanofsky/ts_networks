// block text → NetworkNode, via grammar.ohm. (Sketch.)

import type { Block } from "../../core/types.js";
import type { NetworkNode } from "./ast.js";

export function parseNetwork(_block: Block): NetworkNode {
  throw new Error("parseNetwork: not implemented (sketch)");
}
