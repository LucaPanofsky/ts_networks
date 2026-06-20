// A fn emits PURE JS: its expression compiled to a JS expression, wrapped as a leaf and
// registered. Blocked on the expression compiler — our FnNode body is still raw text
// (see ast.ts), so this is a stub. Shape of the intended output:
//
//   const rectangleArea = (r) => (r.width * r.height);
//   __reg.register("rectangleArea", { arity: 1, impl: rectangleArea,
//     morphism: { from: ["Rectangle?"], to: "Number?" } });

import type { EmitCtx } from "../../core/module.js";
import type { FnNode } from "./ast.js";

export function emitFn(_node: FnNode, _ctx: EmitCtx): string {
  throw new Error("emitFn: not implemented (sketch — needs the expression compiler)");
}
