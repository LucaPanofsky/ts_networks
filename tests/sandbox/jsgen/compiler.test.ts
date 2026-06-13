import { compileRecord, compileExpr, compileEnum, compileProgram, reservedFieldErrors } from "../../../src/sandbox/jsgen/compiler.js";
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

describe("interpolate codegen", () => {
  test("lowers to an __interp call passing the referenced roots", () => {
    const out = compileExpr({ kind: "interpolate", template: "Hi {{name}}!" });
    expect(out).toBe('__interp("Hi {{name}}!", { name: name })');
  });

  test("passes the root once per distinct root, derived from dotted paths", () => {
    // `rec.point` and `rec.body` share the root `rec`; `n` is a second root. The
    // arg object names each root exactly once, in first-appearance order.
    const out = compileExpr({ kind: "interpolate", template: "{{rec.point}} {{n}} {{rec.body}}" });
    expect(out).toBe('__interp("{{rec.point}} {{n}} {{rec.body}}", { rec: rec, n: n })');
  });

  test("emits an empty arg object when there are no placeholders", () => {
    const out = compileExpr({ kind: "interpolate", template: "no holes" });
    expect(out).toBe('__interp("no holes", {  })');
  });
});

// ── Units ─────────────────────────────────────────────────────────────────────

describe("compileProgram", () => {
  const program: ProgramAST = {
    records: [vec2], fns: [addFn], networks: [], derives: [], llmFns: [], enums: [docType], grammars: [], extracts: [], ttables: [], parameters: [],
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

  test("empty program emits only the builtins preamble and a bare return", () => {
    const out = compileProgram({ records: [], fns: [], networks: [], derives: [], llmFns: [], enums: [], grammars: [], extracts: [], ttables: [], parameters: [] });
    // No user definitions, so the export map is empty; the builtins (every/some)
    // are always in scope.
    expect(out).toContain("const every = function(pred, coll)");
    expect(out).toContain("const some = function(pred, coll)");
    expect(out.trimEnd().endsWith("return {};")).toBe(true);
  });
});

// ── Reserved-word record fields (#5) ──────────────────────────────────────────
// A record field becomes a constructor PARAMETER and a value-position identifier in
// the emitted constructor (`function(new) { return { __type, new: new }; }`), so a
// reserved JS word as a field name produces invalid JS that otherwise surfaces only
// as a cryptic SyntaxError when the sandbox is built. These checks turn that late
// failure into an early, located diagnostic.

const programWith = (records: RecordAST[]): ProgramAST => ({
  records, fns: [], networks: [], derives: [], llmFns: [], enums: [], grammars: [], extracts: [], ttables: [], parameters: [],
});

const recordWithField = (field: string): RecordAST => ({
  kind: "record", name: "Foo",
  fields: [{ name: field, type: { kind: "scalar", predicate: "String?" } }],
});

describe("reservedFieldErrors", () => {
  test("flags a reserved word, naming the record and the field", () => {
    const [err, ...rest] = reservedFieldErrors(programWith([recordWithField("new")]));
    expect(rest).toHaveLength(0);
    expect(err).toContain("Foo");
    expect(err).toContain(`"new"`);
    expect(err).toMatch(/reserved JavaScript word/i);
  });

  test("flags every reserved-word field across all records", () => {
    const errs = reservedFieldErrors(programWith([
      { kind: "record", name: "A", fields: [
        { name: "class", type: { kind: "scalar", predicate: "String?" } },
        { name: "ok", type: { kind: "scalar", predicate: "String?" } },
        { name: "default", type: { kind: "scalar", predicate: "String?" } },
      ] },
      { kind: "record", name: "B", fields: [
        { name: "case", type: { kind: "scalar", predicate: "String?" } },
      ] },
    ]));
    expect(errs).toHaveLength(3);
  });

  test("does NOT flag a non-reserved name that merely looks keyword-ish (`type`)", () => {
    // `type` is a TS contextual keyword but a perfectly legal JS identifier, so it
    // compiles fine — the check must use the real JS reserved set, not a guess.
    expect(reservedFieldErrors(programWith([recordWithField("type")]))).toEqual([]);
    expect(reservedFieldErrors(programWith([recordWithField("width")]))).toEqual([]);
  });

  test("a flagged field would otherwise emit invalid JS", () => {
    // Documents WHY the check exists: the raw codegen for the field is unparseable.
    expect(() => new Function(compileRecord(recordWithField("new")) + "\nreturn Foo;")).toThrow();
    // ...while a legal field name compiles.
    expect(() => new Function(compileRecord(recordWithField("type")) + "\nreturn Foo;")).not.toThrow();
  });
});

describe("compileProgram reserved-word guard", () => {
  test("throws a clear, located error instead of emitting invalid JS", () => {
    expect(() => compileProgram(programWith([recordWithField("new")])))
      .toThrow(/reserved JavaScript word/i);
  });

  test("a clean program still compiles", () => {
    expect(() => compileProgram(programWith([recordWithField("width")]))).not.toThrow();
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
