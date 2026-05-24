import { compileRecord, compileExpr, compileFn, compileEnum, compileProgram } from "../../../src/sandbox/jsgen/compiler.js";
import type { RecordAST, FnAST, EnumAST, ProgramAST, Expr, MatchExpr } from "../../../src/data-network/types.js";

// ── compileExpr ───────────────────────────────────────────────────────────────

describe("compileExpr: literals", () => {
  test("integer", () => {
    expect(compileExpr({ kind: "literal", value: 42 })).toBe("42");
  });

  test("float", () => {
    expect(compileExpr({ kind: "literal", value: 3.14 })).toBe("3.14");
  });

  test("string", () => {
    expect(compileExpr({ kind: "literal", value: "hello" })).toBe('"hello"');
  });

  test("boolean true", () => {
    expect(compileExpr({ kind: "literal", value: true })).toBe("true");
  });

  test("boolean false", () => {
    expect(compileExpr({ kind: "literal", value: false })).toBe("false");
  });
});

describe("compileExpr: var", () => {
  test("variable reference", () => {
    expect(compileExpr({ kind: "var", name: "x" })).toBe("x");
  });
});

describe("compileExpr: binary operators", () => {
  const bin = (op: string): Expr => ({
    kind: "binary", op,
    left: { kind: "var", name: "a" },
    right: { kind: "var", name: "b" },
  });

  test("addition", ()       => expect(compileExpr(bin("+"))).toBe("(a + b)"));
  test("subtraction", ()    => expect(compileExpr(bin("-"))).toBe("(a - b)"));
  test("multiplication", () => expect(compileExpr(bin("*"))).toBe("(a * b)"));
  test("division", ()       => expect(compileExpr(bin("/"))).toBe("(a / b)"));
  test("== maps to ===", () => expect(compileExpr(bin("=="))).toBe("(a === b)"));
  test("!= maps to !==", () => expect(compileExpr(bin("!="))).toBe("(a !== b)"));
  test("less than", ()      => expect(compileExpr(bin("<"))).toBe("(a < b)"));
  test("greater than", ()   => expect(compileExpr(bin(">"))).toBe("(a > b)"));
  test("<=", ()             => expect(compileExpr(bin("<="))).toBe("(a <= b)"));
  test(">=", ()             => expect(compileExpr(bin(">="))).toBe("(a >= b)"));
  test("&&", ()             => expect(compileExpr(bin("&&"))).toBe("(a && b)"));
  test("||", ()             => expect(compileExpr(bin("||"))).toBe("(a || b)"));
});

describe("compileExpr: unary", () => {
  test("! stays !", () => {
    expect(compileExpr({ kind: "unary", op: "!", expr: { kind: "var", name: "x" } }))
      .toBe("(!x)");
  });
});

describe("compileExpr: field access", () => {
  test("p.x → p.x", () => {
    expect(compileExpr({ kind: "field", object: { kind: "var", name: "p" }, field: "x" }))
      .toBe("p.x");
  });
});

describe("compileExpr: call", () => {
  test("regular call with args", () => {
    expect(compileExpr({ kind: "call", fn: "sqrt", args: [{ kind: "var", name: "x" }] }))
      .toBe("sqrt(x)");
  });

  test("call with multiple args", () => {
    expect(compileExpr({
      kind: "call", fn: "max",
      args: [{ kind: "var", name: "a" }, { kind: "var", name: "b" }],
    })).toBe("max(a, b)");
  });


  test("if becomes ternary", () => {
    expect(compileExpr({
      kind: "call", fn: "if",
      args: [
        { kind: "binary", op: ">=", left: { kind: "var", name: "x" }, right: { kind: "literal", value: 0 } },
        { kind: "var", name: "x" },
        { kind: "binary", op: "-", left: { kind: "literal", value: 0 }, right: { kind: "var", name: "x" } },
      ],
    })).toBe("((x >= 0) ? x : (0 - x))");
  });
});

describe("compileExpr: nested", () => {
  test("v.x * v.x + v.y * v.y", () => {
    const vx: Expr = { kind: "field", object: { kind: "var", name: "v" }, field: "x" };
    const vy: Expr = { kind: "field", object: { kind: "var", name: "v" }, field: "y" };
    const expr: Expr = {
      kind: "binary", op: "+",
      left:  { kind: "binary", op: "*", left: vx, right: vx },
      right: { kind: "binary", op: "*", left: vy, right: vy },
    };
    expect(compileExpr(expr)).toBe("((v.x * v.x) + (v.y * v.y))");
  });
});

// ── compileFn ─────────────────────────────────────────────────────────────────

describe("compileFn", () => {
  test("single param", () => {
    const fn: FnAST = {
      kind: "fn", isPredicate: false,
      name: "double",
      params: [{ predicate: "Number?", name: "x" }],
      returnType: { kind: "scalar", predicate: "Number?" },
      body: { kind: "binary", op: "*", left: { kind: "var", name: "x" }, right: { kind: "literal", value: 2 } },
    };
    expect(compileFn(fn)).toBe("const double = function(x) { return (x * 2); };");
  });

  test("multiple params", () => {
    const fn: FnAST = {
      kind: "fn", isPredicate: false,
      name: "add",
      params: [{ predicate: "Number?", name: "x" }, { predicate: "Number?", name: "y" }],
      returnType: { kind: "scalar", predicate: "Number?" },
      body: { kind: "binary", op: "+", left: { kind: "var", name: "x" }, right: { kind: "var", name: "y" } },
    };
    expect(compileFn(fn)).toBe("const add = function(x, y) { return (x + y); };");
  });

  test("no params", () => {
    const fn: FnAST = {
      kind: "fn", isPredicate: false,
      name: "pi",
      params: [],
      returnType: { kind: "scalar", predicate: "Number?" },
      body: { kind: "literal", value: 3.14 },
    };
    expect(compileFn(fn)).toBe("const pi = function() { return 3.14; };");
  });

  test("field access in body", () => {
    const fn: FnAST = {
      kind: "fn", isPredicate: false,
      name: "getX",
      params: [{ predicate: "Vec2?", name: "v" }],
      returnType: { kind: "scalar", predicate: "Number?" },
      body: { kind: "field", object: { kind: "var", name: "v" }, field: "x" },
    };
    expect(compileFn(fn)).toBe("const getX = function(v) { return v.x; };");
  });

  test("if in body becomes ternary", () => {
    const fn: FnAST = {
      kind: "fn", isPredicate: false,
      name: "abs",
      params: [{ predicate: "Number?", name: "x" }],
      returnType: { kind: "scalar", predicate: "Number?" },
      body: {
        kind: "call", fn: "if",
        args: [
          { kind: "binary", op: ">=", left: { kind: "var", name: "x" }, right: { kind: "literal", value: 0 } },
          { kind: "var", name: "x" },
          { kind: "binary", op: "-", left: { kind: "literal", value: 0 }, right: { kind: "var", name: "x" } },
        ],
      },
    };
    expect(compileFn(fn)).toBe("const abs = function(x) { return ((x >= 0) ? x : (0 - x)); };");
  });
});

// ── compileRecord ─────────────────────────────────────────────────────────────

describe("compileRecord", () => {
  const vec2: RecordAST = {
    kind: "record",
    name: "Vec2",
    fields: [
      { name: "x", type: { kind: "scalar", predicate: "Number?" } },
      { name: "y", type: { kind: "scalar", predicate: "Number?" } },
    ],
  };

  test("emits constructor as const function", () => {
    expect(compileRecord(vec2)).toContain(
      `const Vec2 = function(x, y) { return { __type: "Vec2", x: x, y: y }; };`
    );
  });

  test("emits predicate as const function with mangled name", () => {
    expect(compileRecord(vec2)).toContain(
      `const Vec2$ = function(v) { return v.__type === "Vec2"; };`
    );
  });

  test("single-field record", () => {
    const rec: RecordAST = {
      kind: "record",
      name: "Wrapper",
      fields: [{ name: "value", type: { kind: "scalar", predicate: "Number?" } }],
    };
    expect(compileRecord(rec)).toContain(
      `const Wrapper = function(value) { return { __type: "Wrapper", value: value }; };`
    );
  });
});

// ── compileProgram ────────────────────────────────────────────────────────────

describe("compileProgram", () => {
  const vec2: RecordAST = {
    kind: "record",
    name: "Vec2",
    fields: [{ name: "x", type: { kind: "scalar", predicate: "Number?" } }, { name: "y", type: { kind: "scalar", predicate: "Number?" } }],
  };

  const lengthFn: FnAST = {
    kind: "fn", isPredicate: false,
    name: "length",
    params: [{ predicate: "Vec2?", name: "v" }],
    returnType: { kind: "scalar", predicate: "Number?" },
    body: {
      kind: "binary", op: "+",
      left:  { kind: "binary", op: "*", left: { kind: "field", object: { kind: "var", name: "v" }, field: "x" }, right: { kind: "field", object: { kind: "var", name: "v" }, field: "x" } },
      right: { kind: "binary", op: "*", left: { kind: "field", object: { kind: "var", name: "v" }, field: "y" }, right: { kind: "field", object: { kind: "var", name: "v" }, field: "y" } },
    },
  };

  const program: ProgramAST = { records: [vec2], fns: [lengthFn], networks: [], derives: [], agents: [], enums: [] };

  test("record constructor appears before fn", () => {
    const out = compileProgram(program);
    const recIdx = out.indexOf("const Vec2 = ");
    const fnIdx  = out.indexOf("const length = ");
    expect(recIdx).toBeLessThan(fnIdx);
  });

  test("contains record constructor", () => {
    expect(compileProgram(program)).toContain(
      `const Vec2 = function(x, y) { return { __type: "Vec2", x: x, y: y }; };`
    );
  });

  test("contains record predicate", () => {
    expect(compileProgram(program)).toContain(
      `const Vec2$ = function(v) { return v.__type === "Vec2"; };`
    );
  });

  test("contains fn", () => {
    expect(compileProgram(program)).toContain(
      `const length = function(v) { return ((v.x * v.x) + (v.y * v.y)); };`
    );
  });

  test("export map includes all names", () => {
    const out = compileProgram(program);
    expect(out).toContain(`"Vec2": Vec2`);
    expect(out).toContain(`"Vec2?": Vec2$`);
    expect(out).toContain(`"length": length`);
  });

  test("empty program emits bare return", () => {
    expect(compileProgram({ records: [], fns: [], networks: [], derives: [], agents: [], enums: [] })).toBe("return {};");
  });
});

// ── compileEnum ───────────────────────────────────────────────────────────────

describe("compileEnum", () => {
  const docType: EnumAST = {
    kind: "enum",
    name: "DocumentType",
    values: ["report", "email", "legal", "technical"],
  };

  test("emits predicate with includes check", () => {
    const out = compileEnum(docType);
    console.log("compileEnum output:", out);
    expect(out).toBe(
      `const DocumentType$ = function(v) { return ["report","email","legal","technical"].includes(v); };`
    );
  });

  test("predicate accepts valid value", () => {
    const out = compileEnum(docType);
    const fn = new Function(out + "\nreturn DocumentType$;")();
    expect(fn("legal")).toBe(true);
    expect(fn("report")).toBe(true);
  });

  test("predicate rejects invalid value", () => {
    const out = compileEnum(docType);
    const fn = new Function(out + "\nreturn DocumentType$;")();
    expect(fn("unknown")).toBe(false);
    expect(fn("")).toBe(false);
  });
});

describe("compileProgram: enum", () => {
  const docType: EnumAST = { kind: "enum", name: "DocumentType", values: ["report", "email", "legal"] };
  const program: ProgramAST = { records: [], fns: [], networks: [], derives: [], agents: [], enums: [docType] };

  test("enum predicate appears in output", () => {
    const out = compileProgram(program);
    console.log("compileProgram with enum:", out);
    expect(out).toContain(`const DocumentType$ = function(v)`);
  });

  test("export map includes enum predicate", () => {
    expect(compileProgram(program)).toContain(`"DocumentType?": DocumentType$`);
  });
});

// ── compileExpr: let ──────────────────────────────────────────────────────────

describe("compileExpr: let", () => {
  test("single binding", () => {
    const expr: Expr = {
      kind: "let",
      bindings: [{ name: "x", value: { kind: "literal", value: 1 } }],
      body: { kind: "var", name: "x" },
    };
    expect(compileExpr(expr)).toBe("(() => { const x = 1; return x; })()");
  });

  test("multiple bindings", () => {
    const expr: Expr = {
      kind: "let",
      bindings: [
        { name: "a", value: { kind: "literal", value: 1 } },
        { name: "b", value: { kind: "literal", value: 2 } },
      ],
      body: { kind: "binary", op: "+", left: { kind: "var", name: "a" }, right: { kind: "var", name: "b" } },
    };
    expect(compileExpr(expr)).toBe("(() => { const a = 1; const b = 2; return (a + b); })()");
  });

  test("binding value can itself be a complex expression", () => {
    const expr: Expr = {
      kind: "let",
      bindings: [{
        name: "sum",
        value: { kind: "binary", op: "+", left: { kind: "var", name: "x" }, right: { kind: "var", name: "y" } },
      }],
      body: { kind: "var", name: "sum" },
    };
    expect(compileExpr(expr)).toBe("(() => { const sum = (x + y); return sum; })()");
  });
});

// ── compileExpr: match ────────────────────────────────────────────────────────

describe("compileExpr: match", () => {
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
          pattern: { kind: "record-pattern", recordName: "Circle", bindings: [{ field: "radius", as: "r" }] },
          guard: null,
          body: { kind: "literal", value: "small" },
        },
        {
          pattern: { kind: "wildcard" },
          guard: null,
          body: { kind: "literal", value: "other" },
        },
      ],
    };
    expect(compileExpr(expr)).toBe(
      `(() => { const __v = s; if (__v.__type === "Circle") { const r = __v.radius; if ((r > 10)) return "large"; } if (__v.__type === "Circle") { const r = __v.radius; return "small"; } return "other"; })()`
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

  test("wildcard-only arm (catch-all fn)", () => {
    const expr: MatchExpr = {
      kind: "match",
      subject: { kind: "var", name: "x" },
      arms: [{ pattern: { kind: "wildcard" }, guard: null, body: { kind: "literal", value: 42 } }],
    };
    expect(compileExpr(expr)).toBe(`(() => { const __v = x; return 42; })()`);
  });
});
