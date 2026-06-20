// The expression sub-language module: parse (Ohm → existing Expr) + emit (reuse the
// existing compileExpr). Shared by defn/defpredicate.

export { parseExpression } from "./parse.js";
export { compileExpr } from "../../sandbox/jsgen/compiler.js";
