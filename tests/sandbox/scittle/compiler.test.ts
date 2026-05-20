import { compileRecord, compileExpr, compileFn, compileProgram } from "../../../src/sandbox/scittle/compiler.js";
import type { RecordAST, FnAST, ProgramAST, Expr } from "../../../src/data-network/types.js";

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

  test("addition", ()        => expect(compileExpr(bin("+"))).toBe("(+ a b)"));
  test("subtraction", ()     => expect(compileExpr(bin("-"))).toBe("(- a b)"));
  test("multiplication", ()  => expect(compileExpr(bin("*"))).toBe("(* a b)"));
  test("division", ()        => expect(compileExpr(bin("/"))).toBe("(/ a b)"));
  test("== maps to =", ()    => expect(compileExpr(bin("=="))).toBe("(= a b)"));
  test("!= maps to not=", () => expect(compileExpr(bin("!="))).toBe("(not= a b)"));
  test("less than", ()       => expect(compileExpr(bin("<"))).toBe("(< a b)"));
  test("greater than", ()    => expect(compileExpr(bin(">"))).toBe("(> a b)"));
  test("<=", ()              => expect(compileExpr(bin("<="))).toBe("(<= a b)"));
  test(">=", ()              => expect(compileExpr(bin(">="))).toBe("(>= a b)"));
  test("&& maps to and", ()  => expect(compileExpr(bin("&&"))).toBe("(and a b)"));
  test("|| maps to or", ()   => expect(compileExpr(bin("||"))).toBe("(or a b)"));
});

describe("compileExpr: unary", () => {
  test("! maps to not", () => {
    expect(compileExpr({ kind: "unary", op: "!", expr: { kind: "var", name: "x" } }))
      .toBe("(not x)");
  });
});

describe("compileExpr: field access", () => {
  test("p.x → (:x p)", () => {
    expect(compileExpr({ kind: "field", object: { kind: "var", name: "p" }, field: "x" }))
      .toBe("(:x p)");
  });
});

describe("compileExpr: call", () => {
  test("regular call with args", () => {
    expect(compileExpr({ kind: "call", fn: "sqrt", args: [{ kind: "var", name: "x" }] }))
      .toBe("(sqrt x)");
  });

  test("call with multiple args", () => {
    expect(compileExpr({
      kind: "call", fn: "max",
      args: [{ kind: "var", name: "a" }, { kind: "var", name: "b" }],
    })).toBe("(max a b)");
  });

  test("if special form", () => {
    expect(compileExpr({
      kind: "call", fn: "if",
      args: [
        { kind: "binary", op: ">=", left: { kind: "var", name: "x" }, right: { kind: "literal", value: 0 } },
        { kind: "var", name: "x" },
        { kind: "binary", op: "-", left: { kind: "literal", value: 0 }, right: { kind: "var", name: "x" } },
      ],
    })).toBe("(if (>= x 0) x (- 0 x))");
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
    expect(compileExpr(expr)).toBe("(+ (* (:x v) (:x v)) (* (:y v) (:y v)))");
  });
});

// ── compileFn ─────────────────────────────────────────────────────────────────

describe("compileFn", () => {
  test("single param", () => {
    const fn: FnAST = {
      kind: "fn",
      name: "double",
      params: [{ predicate: "Number?", name: "x" }],
      returnType: "Number?",
      body: { kind: "binary", op: "*", left: { kind: "var", name: "x" }, right: { kind: "literal", value: 2 } },
    };
    expect(compileFn(fn)).toBe("(defn double [x] (* x 2))");
  });

  test("multiple params", () => {
    const fn: FnAST = {
      kind: "fn",
      name: "add",
      params: [{ predicate: "Number?", name: "x" }, { predicate: "Number?", name: "y" }],
      returnType: "Number?",
      body: { kind: "binary", op: "+", left: { kind: "var", name: "x" }, right: { kind: "var", name: "y" } },
    };
    expect(compileFn(fn)).toBe("(defn add [x y] (+ x y))");
  });

  test("no params", () => {
    const fn: FnAST = {
      kind: "fn",
      name: "pi",
      params: [],
      returnType: "Number?",
      body: { kind: "literal", value: 3.14 },
    };
    expect(compileFn(fn)).toBe("(defn pi [] 3.14)");
  });

  test("field access in body", () => {
    const fn: FnAST = {
      kind: "fn",
      name: "get-x",
      params: [{ predicate: "Vec2?", name: "v" }],
      returnType: "Number?",
      body: { kind: "field", object: { kind: "var", name: "v" }, field: "x" },
    };
    expect(compileFn(fn)).toBe("(defn get-x [v] (:x v))");
  });

  test("if in body", () => {
    const fn: FnAST = {
      kind: "fn",
      name: "abs",
      params: [{ predicate: "Number?", name: "x" }],
      returnType: "Number?",
      body: {
        kind: "call", fn: "if",
        args: [
          { kind: "binary", op: ">=", left: { kind: "var", name: "x" }, right: { kind: "literal", value: 0 } },
          { kind: "var", name: "x" },
          { kind: "binary", op: "-", left: { kind: "literal", value: 0 }, right: { kind: "var", name: "x" } },
        ],
      },
    };
    expect(compileFn(fn)).toBe("(defn abs [x] (if (>= x 0) x (- 0 x)))");
  });
});

// ── compileRecord ─────────────────────────────────────────────────────────────

describe("compileRecord", () => {
  const vec2: RecordAST = {
    kind: "record",
    name: "Vec2",
    fields: [
      { name: "x", predicate: "Number?" },
      { name: "y", predicate: "Number?" },
    ],
  };

  test("emits constructor defn", () => {
    expect(compileRecord(vec2)).toContain(
      "(defn Vec2 [x y] {:__type :Vec2 :x x :y y})"
    );
  });

  test("emits predicate defn", () => {
    expect(compileRecord(vec2)).toContain(
      "(defn Vec2? [v] (= (:__type v) :Vec2))"
    );
  });

  test("single-field record", () => {
    const rec: RecordAST = {
      kind: "record",
      name: "Wrapper",
      fields: [{ name: "value", predicate: "Number?" }],
    };
    expect(compileRecord(rec)).toContain(
      "(defn Wrapper [value] {:__type :Wrapper :value value})"
    );
  });
});

// ── compileProgram ────────────────────────────────────────────────────────────

describe("compileProgram", () => {
  const vec2: RecordAST = {
    kind: "record",
    name: "Vec2",
    fields: [{ name: "x", predicate: "Number?" }, { name: "y", predicate: "Number?" }],
  };

  const lengthFn: FnAST = {
    kind: "fn",
    name: "length",
    params: [{ predicate: "Vec2?", name: "v" }],
    returnType: "Number?",
    body: {
      kind: "binary", op: "+",
      left:  { kind: "binary", op: "*", left: { kind: "field", object: { kind: "var", name: "v" }, field: "x" }, right: { kind: "field", object: { kind: "var", name: "v" }, field: "x" } },
      right: { kind: "binary", op: "*", left: { kind: "field", object: { kind: "var", name: "v" }, field: "y" }, right: { kind: "field", object: { kind: "var", name: "v" }, field: "y" } },
    },
  };

  const program: ProgramAST = { records: [vec2], fns: [lengthFn], networks: [] };

  test("output is wrapped in do", () => {
    expect(compileProgram(program)).toMatch(/^\(do\n/);
  });

  test("record constructor appears before fn", () => {
    const out = compileProgram(program);
    const recIdx = out.indexOf("(defn Vec2 [");
    const fnIdx  = out.indexOf("(defn length [");
    expect(recIdx).toBeLessThan(fnIdx);
  });

  test("contains record constructor", () => {
    expect(compileProgram(program)).toContain("(defn Vec2 [x y] {:__type :Vec2 :x x :y y})");
  });

  test("contains record predicate", () => {
    expect(compileProgram(program)).toContain("(defn Vec2? [v] (= (:__type v) :Vec2))");
  });

  test("contains fn", () => {
    expect(compileProgram(program)).toContain("(defn length [v] (+ (* (:x v) (:x v)) (* (:y v) (:y v))))");
  });

  test("empty program emits bare do", () => {
    expect(compileProgram({ records: [], fns: [], networks: [] })).toBe("(do\n)");
  });
});
