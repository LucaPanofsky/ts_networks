// The expression sub-language module: parse (Ohm → existing Expr) + emit (the expression
// lowerer). Shared by defn/defpredicate.

export { parseExpression } from "./parse.js";
export { compileExpr, mangle } from "./compile.js";
