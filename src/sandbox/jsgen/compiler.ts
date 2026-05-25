import type { RecordAST, FnAST, EnumAST, ProgramAST, Expr, RecordPattern } from "../../data-network/types.js";

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

export function compileEnum(en: EnumAST): string {
  const predVar = mangle(`${en.name}?`);
  const set = JSON.stringify(en.values);
  return `const ${predVar} = function(v) { return ${set}.includes(v); };`;
}

function compileExportMap(program: ProgramAST): string {
  const entries: string[] = [
    ...program.records.flatMap(r => [
      `"${r.name}": ${r.name}`,
      `"${r.name}?": ${mangle(r.name + "?")}`,
    ]),
    ...program.enums.map(e => `"${e.name}?": ${mangle(e.name + "?")}`),
    ...program.fns.map(f => `"${f.name}": ${mangle(f.name)}`),
  ];
  return entries.length === 0 ? "return {};" : `return { ${entries.join(", ")} };`;
}

export function compileProgram(program: ProgramAST): string {
  const lines: string[] = [
    ...program.records.map(compileRecord),
    ...program.enums.map(compileEnum),
    ...program.fns.map(compileFn),
    compileExportMap(program),
  ];
  return lines.join("\n");
}
