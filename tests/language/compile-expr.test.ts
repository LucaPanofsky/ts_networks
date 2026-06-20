import { compileExpr } from "../../src/language/expr/compile.js";
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
