import type { RecordAST, FnAST, ProgramAST, Expr } from "../../data-network/types.js";

function mangle(name: string): string {
  return name.replace(/\?/g, "$").replace(/!/g, "_");
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
      return `(!${compileExpr(expr.expr)})`;
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
    case "let": {
      const bindings = expr.bindings.map(b => `const ${b.name} = ${compileExpr(b.value)};`).join(" ");
      return `(() => { ${bindings} return ${compileExpr(expr.body)}; })()`;
    }
  }
}

export function compileFn(fn: FnAST): string {
  const params = fn.params.map(p => p.name).join(", ");
  return `const ${mangle(fn.name)} = function(${params}) { return ${compileExpr(fn.body)}; };`;
}

export function compileRecord(rec: RecordAST): string {
  const fields = rec.fields.map(f => f.name).join(", ");
  const fieldEntries = rec.fields.map(f => `${f.name}: ${f.name}`).join(", ");
  const constructor = `const ${rec.name} = function(${fields}) { return { __type: "${rec.name}", ${fieldEntries} }; };`;
  const predVar = mangle(`${rec.name}?`);
  const predicate = `const ${predVar} = function(v) { return v.__type === "${rec.name}"; };`;
  return `${constructor}\n${predicate}`;
}

function compileExportMap(program: ProgramAST): string {
  const entries: string[] = [
    ...program.records.flatMap(r => [
      `"${r.name}": ${r.name}`,
      `"${r.name}?": ${mangle(r.name + "?")}`,
    ]),
    ...program.fns.map(f => `"${f.name}": ${mangle(f.name)}`),
  ];
  return entries.length === 0 ? "return {};" : `return { ${entries.join(", ")} };`;
}

export function compileProgram(program: ProgramAST): string {
  const lines: string[] = [
    ...program.records.map(compileRecord),
    ...program.fns.map(compileFn),
    compileExportMap(program),
  ];
  return lines.join("\n");
}
