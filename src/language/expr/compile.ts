// The expression lowerer: an `Expr` AST → a JS expression string. Shared by the modular
// emit pipeline — a `defn`/`defpredicate` body lowers through here (see expr/index.ts), and
// an `interpolate` body lowers to the injected `__interp(template, args)` helper. Depends only
// on the AST types + placeholder analysis, so it sits below both the language and sandbox
// layers. (Moved out of the retired jsgen compiler, of which it was the one piece the modular
// path reused.)

import type { Expr, RecordPattern } from "../../data-network/types.js";
import { placeholderPaths } from "../../data-network/placeholders.js";

export function mangle(name: string): string {
  // DSL names may contain `?`, `!`, and `/` (the last for qualified names like
  // `str/contains?`); none are legal in a JS identifier, so rewrite them to a safe
  // form. The same mangle runs on both definitions and call sites, so they match.
  return name.replace(/\?/g, "$").replace(/!/g, "_").replace(/\//g, "$");
}

export function compileExpr(expr: Expr): string {
  switch (expr.kind) {
    case "literal": {
      if (typeof expr.value === "string") return `"${expr.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      return String(expr.value);
    }
    case "var":
      return mangle(expr.name);
    case "binary": {
      const op = expr.op === "==" ? "===" : expr.op === "!=" ? "!==" : expr.op;
      return `(${compileExpr(expr.left)} ${op} ${compileExpr(expr.right)})`;
    }
    case "unary":
      return `(${expr.op}${compileExpr(expr.expr)})`;
    case "field":
      return `${compileExpr(expr.object)}.${expr.field}`;
    case "call": {
      if (expr.fn === "if") {
        const [cond, then_, else_] = expr.args;
        return `(${compileExpr(cond!)} ? ${compileExpr(then_!)} : ${compileExpr(else_!)})`;
      }
      const args = expr.args.map(compileExpr).join(", ");
      return `${mangle(expr.fn)}(${args})`;
    }
    case "match": {
      const subject = compileExpr(expr.subject);
      const lines: string[] = [`const __v = ${subject};`];
      for (const arm of expr.arms) {
        if (arm.pattern.kind === "wildcard") {
          lines.push(`return ${compileExpr(arm.body)};`);
        } else {
          const pat = arm.pattern as RecordPattern;
          const bindings = pat.bindings.map(b => `const ${b.as} = __v.${b.field};`).join(" ");
          const guard = arm.guard ? `if (${compileExpr(arm.guard)}) ` : "";
          const ret = `${guard}return ${compileExpr(arm.body)};`;
          const inner = bindings ? `${bindings} ${ret}` : ret;
          lines.push(`if (__v.__type === "${pat.recordName}") { ${inner} }`);
        }
      }
      return `(() => { ${lines.join(" ")} })()`;
    }
    case "let": {
      const inner = expr.bindings.reduceRight(
        (body, b) => `(() => { const ${b.name} = ${compileExpr(b.value)}; return ${body}; })()`,
        compileExpr(expr.body),
      );
      return inner;
    }
    case "interpolate": {
      // Lower to the injected `__interp(template, args)` helper (mirrors how a
      // grammar lowers to `__g`), so interpolation runs through the same renderer
      // as `defllmfn` prompts. The arg object passes exactly the referenced roots
      // — the part of each `{{path}}` before the first `.`. Roots are `\w+`, hence
      // valid JS identifiers matching the (unmangled) parameter names: `{ rec: rec }`.
      const roots = [...new Set(placeholderPaths(expr.template).map(p => p.split(".")[0]))];
      const args = roots.map(r => `${r}: ${r}`).join(", ");
      return `__interp(${JSON.stringify(expr.template)}, { ${args} })`;
    }
  }
}
