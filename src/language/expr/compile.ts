// The expression lowerer: an `Expr` AST → a JS expression string. Shared by the modular
// emit pipeline — a `defn`/`defpredicate` body lowers through here (see expr/index.ts), and
// an `interpolate` body lowers to the injected `__interp(template, args)` helper. Depends only
// on the AST types + placeholder analysis, so it sits below both the language and sandbox
// layers. (Moved out of the retired jsgen compiler, of which it was the one piece the modular
// path reused.)

import type { Expr, RecordPattern } from "../../data-network/types.js";
import { placeholderPaths } from "../../placeholders.js";
import { RESERVED_JS_WORDS } from "../core/reserved-js-words.js";

// DSL name → a safe, STABLE JS identifier. The SINGLE definition of mangle (the emit
// pipeline imports this same function), so a binding and every reference to it always
// agree. Two jobs:
//   1. rewrite the chars the grammar allows in a name but JS forbids in an identifier —
//      `?`, `!`, `/` (qualified names like `str/contains?`), and `-` (kebab names).
//   2. escape a name that mangles to a bare JS reserved word (`class` → `class_`), so a
//      param/let/match binder or a fn named `class`/`new`/… emits valid JS.
// Mangle is applied at identifier positions only (definitions AND references); record DATA
// keys are emitted verbatim-quoted instead (see defrecord/emit.ts), so output JSON keeps
// the raw field name. Caveat: the char map is not injective (`?`/`/`/`-` all → `$`, `!`→`_`),
// so two *distinct* DSL names could in principle collide in one scope — a pre-existing
// limitation, not addressed here.
export function mangle(name: string): string {
  const mapped = name.replace(/\?/g, "$").replace(/!/g, "_").replace(/\//g, "$").replace(/-/g, "$");
  return RESERVED_JS_WORDS.has(mapped) ? `${mapped}_` : mapped;
}

export function compileExpr(expr: Expr): string {
  switch (expr.kind) {
    case "literal": {
      // JSON.stringify escapes ALL control chars + the JS line terminators U+2028/U+2029, so a
      // multi-line `'…'` literal (the grammar's `any` matches newline) emits valid JS rather than
      // a raw line break (a SyntaxError at eval). Numbers/booleans pass through as-is.
      if (typeof expr.value === "string") return JSON.stringify(expr.value);
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
