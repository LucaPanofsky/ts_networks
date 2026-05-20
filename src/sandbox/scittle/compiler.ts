import type { RecordAST, FnAST, ProgramAST, Expr } from "../../data-network/types.js";

const BINARY_OPS: Record<string, string> = {
  "==": "=",
  "!=": "not=",
  "&&": "and",
  "||": "or",
};

export function compileExpr(expr: Expr): string {
  switch (expr.kind) {
    case "literal": {
      if (typeof expr.value === "string") return `"${expr.value.replace(/"/g, '\\"')}"`;
      return String(expr.value);
    }
    case "var":
      return expr.name;
    case "binary": {
      const op = BINARY_OPS[expr.op] ?? expr.op;
      return `(${op} ${compileExpr(expr.left)} ${compileExpr(expr.right)})`;
    }
    case "unary":
      return `(not ${compileExpr(expr.expr)})`;
    case "field":
      return `(:${expr.field} ${compileExpr(expr.object)})`;
    case "call": {
      if (expr.fn === "if") {
        const [cond, then_, else_] = expr.args;
        return `(if ${compileExpr(cond!)} ${compileExpr(then_!)} ${compileExpr(else_!)})`;
      }
      const args = expr.args.map(compileExpr).join(" ");
      return args ? `(${expr.fn} ${args})` : `(${expr.fn})`;
    }
  }
}

export function compileFn(fn: FnAST): string {
  const params = fn.params.map(p => p.name).join(" ");
  return `(defn ${fn.name} [${params}] ${compileExpr(fn.body)})`;
}

export function compileProgram(program: ProgramAST, extraForms: string[] = []): string {
  const forms: string[] = [
    ...program.records.map(compileRecord),
    ...program.fns.map(compileFn),
    ...extraForms,
  ];
  return `(do\n${forms.join("\n")})`;
}

export function compileRecord(rec: RecordAST): string {
  const fields = rec.fields.map(f => f.name).join(" ");
  const fieldEntries = rec.fields.map(f => `:${f.name} ${f.name}`).join(" ");
  const constructor = `(defn ${rec.name} [${fields}] {:__type "${rec.name}" ${fieldEntries}})`;
  const predicate = `(defn ${rec.name}? [v] (= (:__type v) "${rec.name}"))`;
  return `${constructor}\n${predicate}`;
}

function coercedWrapper(name: string, arity: number): string {
  const args = Array.from({ length: arity }, (_, i) => `a${i}`);
  const argsStr = args.join(" ");
  const coercedArgs = args.map(a => `(js->clj ${a} :keywordize-keys true)`).join(" ");
  const call = arity === 0 ? `(${name})` : `(${name} ${coercedArgs})`;
  return `"${name}" (fn [${argsStr}] (clj->js ${call}))`;
}

export function compileCoercedExportMap(program: ProgramAST): string {
  const entries: string[] = [
    ...program.records.flatMap(r => [
      coercedWrapper(r.name, r.fields.length),
      coercedWrapper(`${r.name}?`, 1),
    ]),
    ...program.fns.map(f => coercedWrapper(f.name, f.params.length)),
  ];
  return `#js {${entries.join(" ")}}`;
}
