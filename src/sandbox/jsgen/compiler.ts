import type { RecordAST, FnAST, EnumAST, ProgramAST, Expr, RecordPattern } from "../../data-network/types.js";

function mangle(name: string): string {
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

// Builtins available to every expression. They are plain JS in the sandbox scope,
// so a predicate written `big?` (which compiles to a function value) can be passed
// straight in: `expression every(big?, xs)`. First-order from the DSL's view; the
// host language already has functions as values, so nothing else is needed.
//
// `every`/`some` are general collection questions and stay flat. String functions
// are namespaced under `str/` (a qualified name — the `/` is mangled like any other
// identifier char). Strings are deliberately non-regex: literal split/join for
// replace, includes-based predicates. Regex is a separate, later decision.
const BUILTIN_DEFS: Record<string, string> = {
  every: `function(pred, coll) { return coll.every(function(x) { return pred(x); }); }`,
  some:  `function(pred, coll) { return coll.some(function(x) { return pred(x); }); }`,
  str:   `function() { return Array.prototype.slice.call(arguments).join(""); }`,
  "str/length":      `function(s) { return s.length; }`,
  "str/upper":       `function(s) { return s.toUpperCase(); }`,
  "str/lower":       `function(s) { return s.toLowerCase(); }`,
  "str/trim":        `function(s) { return s.trim(); }`,
  "str/substring":   `function(s, start, end) { return s.substring(start, end); }`,
  "str/split":       `function(s, sep) { return s.split(sep); }`,
  "str/join":        `function(coll, sep) { return coll.join(sep); }`,
  "str/replace":     `function(s, find, repl) { return s.split(find).join(repl); }`,
  "str/contains?":   `function(s, sub) { return s.includes(sub); }`,
  "str/startsWith?": `function(s, p) { return s.startsWith(p); }`,
  "str/endsWith?":   `function(s, p) { return s.endsWith(p); }`,
  "str/blank?":      `function(s) { return s.trim().length === 0; }`,
};

export function compileProgram(program: ProgramAST): string {
  // A builtin and a user definition would both be top-level `const`s in the same
  // scope, so a clash is a hard SyntaxError. Skip any builtin whose (mangled) name
  // the program defines — the user's definition wins (shadowing, not collision).
  const declared = new Set<string>([
    ...program.records.flatMap(r => [mangle(r.name), mangle(`${r.name}?`)]),
    ...program.enums.map(e => mangle(`${e.name}?`)),
    ...program.fns.map(f => mangle(f.name)),
  ]);
  const builtins = Object.entries(BUILTIN_DEFS)
    .filter(([name]) => !declared.has(mangle(name)))
    .map(([name, fn]) => `const ${mangle(name)} = ${fn};`);

  const lines: string[] = [
    ...builtins,
    ...program.records.map(compileRecord),
    ...program.enums.map(compileEnum),
    ...program.fns.map(compileFn),
    compileExportMap(program),
  ];
  return lines.join("\n");
}
