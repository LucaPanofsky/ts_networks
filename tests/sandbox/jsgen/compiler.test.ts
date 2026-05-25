import { compileRecord, compileExpr, compileEnum, compileProgram } from "../../../src/sandbox/jsgen/compiler.js";
import type { RecordAST, FnAST, EnumAST, ProgramAST, Expr, MatchExpr } from "../../../src/data-network/types.js";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const vec2: RecordAST = {
  kind: "record",
  name: "Vec2",
  fields: [
    { name: "x", type: { kind: "scalar", predicate: "Number?" } },
    { name: "y", type: { kind: "scalar", predicate: "Number?" } },
  ],
};

const docType: EnumAST = { kind: "enum", name: "DocType", values: ["report", "email"] };

const addFn: FnAST = {
  kind: "fn", isPredicate: false, name: "add",
  params: [{ predicate: "Number?", name: "x" }, { predicate: "Number?", name: "y" }],
  returnType: { kind: "scalar", predicate: "Number?" },
  body: { kind: "binary", op: "+", left: { kind: "var", name: "x" }, right: { kind: "var", name: "y" } },
};

// ── Capabilities ──────────────────────────────────────────────────────────────

describe("compileRecord", () => {
  test("emits constructor and predicate", () => {
    const out = compileRecord(vec2);
    expect(out).toContain(`const Vec2 = function(x, y) { return { __type: "Vec2", x: x, y: y }; };`);
    expect(out).toContain(`const Vec2$ = function(v) { return v.__type === "Vec2"; };`);
  });
});

describe("compileEnum", () => {
  test("emits predicate with includes check", () => {
    expect(compileEnum(docType)).toBe(
      `const DocType$ = function(v) { return ["report","email"].includes(v); };`
    );
  });

  test("predicate accepts valid value and rejects invalid", () => {
    const fn = new Function(compileEnum(docType) + "\nreturn DocType$;")();
    expect(fn("report")).toBe(true);
    expect(fn("unknown")).toBe(false);
  });
});

// ── Invariants ────────────────────────────────────────────────────────────────

describe("invariants", () => {
  const bin = (op: string): Expr => ({
    kind: "binary", op,
    left: { kind: "var", name: "a" },
    right: { kind: "var", name: "b" },
  });

  test("== rewrites to === (strict equality)", () => {
    expect(compileExpr(bin("=="))).toBe("(a === b)");
  });

  test("!= rewrites to !== (strict inequality)", () => {
    expect(compileExpr(bin("!="))).toBe("(a !== b)");
  });

  test("string literal escapes backslash and double-quote", () => {
    expect(compileExpr({ kind: "literal", value: 'say "hi" \\here' })).toBe('"say \\"hi\\" \\\\here"');
  });
});

// ── Units ─────────────────────────────────────────────────────────────────────

describe("compileProgram", () => {
  const program: ProgramAST = {
    records: [vec2], fns: [addFn], networks: [], derives: [], agents: [], enums: [docType],
  };

  test("records emitted before functions", () => {
    const out = compileProgram(program);
    expect(out.indexOf("const Vec2 = ")).toBeLessThan(out.indexOf("const add = "));
  });

  test("export map includes record, predicate, fn, and enum predicate", () => {
    const out = compileProgram(program);
    expect(out).toContain(`"Vec2": Vec2`);
    expect(out).toContain(`"Vec2?": Vec2$`);
    expect(out).toContain(`"add": add`);
    expect(out).toContain(`"DocType?": DocType$`);
  });

  test("empty program emits bare return", () => {
    expect(compileProgram({ records: [], fns: [], networks: [], derives: [], agents: [], enums: [] }))
      .toBe("return {};");
  });
});

describe("match codegen", () => {
  test("record pattern with guard and wildcard fallback", () => {
    const expr: MatchExpr = {
      kind: "match",
      subject: { kind: "var", name: "s" },
      arms: [
        {
          pattern: { kind: "record-pattern", recordName: "Circle", bindings: [{ field: "radius", as: "r" }] },
          guard: { kind: "binary", op: ">", left: { kind: "var", name: "r" }, right: { kind: "literal", value: 10 } },
          body: { kind: "literal", value: "large" },
        },
        {
          pattern: { kind: "wildcard" },
          guard: null,
          body: { kind: "literal", value: "other" },
        },
      ],
    };
    expect(compileExpr(expr)).toBe(
      `(() => { const __v = s; if (__v.__type === "Circle") { const r = __v.radius; if ((r > 10)) return "large"; } return "other"; })()`
    );
  });

  test("multiple field bindings", () => {
    const expr: MatchExpr = {
      kind: "match",
      subject: { kind: "var", name: "p" },
      arms: [
        {
          pattern: { kind: "record-pattern", recordName: "Point", bindings: [{ field: "x", as: "x" }, { field: "y", as: "y" }] },
          guard: null,
          body: { kind: "binary", op: "+", left: { kind: "var", name: "x" }, right: { kind: "var", name: "y" } },
        },
        { pattern: { kind: "wildcard" }, guard: null, body: { kind: "literal", value: 0 } },
      ],
    };
    expect(compileExpr(expr)).toBe(
      `(() => { const __v = p; if (__v.__type === "Point") { const x = __v.x; const y = __v.y; return (x + y); } return 0; })()`
    );
  });

  test("wildcard-only arm", () => {
    const expr: MatchExpr = {
      kind: "match",
      subject: { kind: "var", name: "x" },
      arms: [{ pattern: { kind: "wildcard" }, guard: null, body: { kind: "literal", value: 42 } }],
    };
    expect(compileExpr(expr)).toBe(`(() => { const __v = x; return 42; })()`);
  });
});
