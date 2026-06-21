import { compileExpr, mangle } from "../../src/language/expr/compile.js";
import { mangle as emitMangle } from "../../src/language/expr/index.js";
import { defaultCtx } from "../../src/language/pipeline/emit.js";
import type { Expr } from "../../src/data-network/types.js";

// compileExpr — the expression lowerer (Expr → JS expression string). The PARSE side is covered
// by expr.test.ts; these pin the LOWERING invariants (operator rewrites, string escaping,
// interpolate codegen). Ported from the retired jsgen compiler tests, repointed at the lowerer's
// new home in the language layer.

const bin = (op: string): Expr =>
  ({ kind: "binary", op, left: { kind: "var", name: "a" }, right: { kind: "var", name: "b" } }) as Expr;

describe("compileExpr — lowering invariants", () => {
  test("== rewrites to === (strict equality)", () => {
    expect(compileExpr(bin("=="))).toBe("(a === b)");
  });

  test("!= rewrites to !== (strict inequality)", () => {
    expect(compileExpr(bin("!="))).toBe("(a !== b)");
  });

  test("string literal escapes backslash and double-quote", () => {
    expect(compileExpr({ kind: "literal", value: 'say "hi" \\here' } as Expr)).toBe('"say \\"hi\\" \\\\here"');
  });
});

describe("mangle — total name→identifier map (single source)", () => {
  test("rewrites grammar-legal-but-JS-illegal chars: ? ! / -", () => {
    expect(mangle("ok?")).toBe("ok$");
    expect(mangle("set!")).toBe("set_");
    expect(mangle("str/upper")).toBe("str$upper"); // existing mapping unchanged
    expect(mangle("kebab-name")).toBe("kebab$name"); // newly handled
  });

  test("escapes a name that mangles to a JS reserved word (suffix _)", () => {
    expect(mangle("class")).toBe("class_");
    expect(mangle("new")).toBe("new_");
    expect(mangle("let")).toBe("let_");
    // not reserved → untouched
    expect(mangle("type")).toBe("type");
    expect(mangle("classy")).toBe("classy");
    // reserved only checked AFTER char-mapping, so `class?` → `class$` (not reserved)
    expect(mangle("class?")).toBe("class$");
  });

  test("plain identifiers pass through unchanged", () => {
    expect(mangle("foo")).toBe("foo");
    expect(mangle("a_b")).toBe("a_b");
  });

  test("there is ONE mangle — the emit pipeline uses the same function", () => {
    // expr barrel re-export and pipeline defaultCtx.mangle are the identical function.
    expect(emitMangle).toBe(mangle);
    expect(defaultCtx.mangle).toBe(mangle);
    expect(defaultCtx.mangle("class")).toBe("class_");
  });
});

describe("compileExpr — interpolate codegen", () => {
  test("lowers to an __interp call passing the referenced roots", () => {
    expect(compileExpr({ kind: "interpolate", template: "Hi {{name}}!" } as Expr)).toBe(
      '__interp("Hi {{name}}!", { name: name })',
    );
  });

  test("passes the root once per distinct root, derived from dotted paths", () => {
    expect(compileExpr({ kind: "interpolate", template: "{{rec.point}} {{n}} {{rec.body}}" } as Expr)).toBe(
      '__interp("{{rec.point}} {{n}} {{rec.body}}", { rec: rec, n: n })',
    );
  });

  test("emits an empty arg object when there are no placeholders", () => {
    expect(compileExpr({ kind: "interpolate", template: "no holes" } as Expr)).toBe('__interp("no holes", {  })');
  });
});
