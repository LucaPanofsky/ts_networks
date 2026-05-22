import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { parser } from "../../src/data-network/parser.js";
import type { BinaryExpr, CallExpr, FieldExpr, FnAST, LetExpr, LiteralExpr, RecordAST, UnaryExpr, VarExpr } from "../../src/data-network/types.js";

// ── defrecord ─────────────────────────────────────────────────────────────────

const recordInput = `
defrecord Point
  x: Number?;
  y: Number?;
  label: String?;
end
`;

describe("parseProgram: defrecord basic", () => {
  const prog = parseProgram(recordInput);
  const rec = prog.records[0]! as RecordAST;

  test("record name", () => {
    expect(rec.name).toBe("Point");
  });

  test("field count", () => {
    expect(rec.fields).toHaveLength(3);
  });

  test("first field", () => {
    expect(rec.fields[0]).toEqual({ name: "x", predicate: "Number?" });
  });

  test("second field", () => {
    expect(rec.fields[1]).toEqual({ name: "y", predicate: "Number?" });
  });

  test("third field", () => {
    expect(rec.fields[2]).toEqual({ name: "label", predicate: "String?" });
  });

  test("no error nodes", () => {
    const tree = parser.parse(recordInput.trim());
    const cursor = tree.cursor();
    do {
      expect(cursor.name).not.toBe("⚠");
    } while (cursor.next());
  });
});

// ── defn — basic ────────────────────────────────────────────────────────────

const fnSimple = `
defn add
  signature: from [Number?(x), Number?(y)] to Number?;
  expression x + y;
end
`;

describe("parseProgram: defn basic", () => {
  const prog = parseProgram(fnSimple);
  const fn = prog.fns[0]! as FnAST;

  test("fn name", () => {
    expect(fn.name).toBe("add");
  });

  test("isPredicate is false", () => {
    expect(fn.isPredicate).toBe(false);
  });

  test("param count", () => {
    expect(fn.params).toHaveLength(2);
  });

  test("first param", () => {
    expect(fn.params[0]).toEqual({ predicate: "Number?", name: "x" });
  });

  test("second param", () => {
    expect(fn.params[1]).toEqual({ predicate: "Number?", name: "y" });
  });

  test("return type", () => {
    expect(fn.returnType).toBe("Number?");
  });

  test("body op", () => {
    expect((fn.body as BinaryExpr).op).toBe("+");
  });

  test("body left is var x", () => {
    expect((fn.body as BinaryExpr).left).toEqual({ kind: "var", name: "x" });
  });

  test("body right is var y", () => {
    expect((fn.body as BinaryExpr).right).toEqual({ kind: "var", name: "y" });
  });

  test("no error nodes", () => {
    const tree = parser.parse(fnSimple.trim());
    const cursor = tree.cursor();
    do {
      expect(cursor.name).not.toBe("⚠");
    } while (cursor.next());
  });
});

// ── defn — no params ────────────────────────────────────────────────────────

const fnNoParams = `
defn pi
  signature: from to Number?;
  expression 3;
end
`;

describe("parseProgram: defn no params", () => {
  const prog = parseProgram(fnNoParams);
  const fn = prog.fns[0]!;

  test("empty params", () => {
    expect(fn.params).toHaveLength(0);
  });

  test("return type", () => {
    expect(fn.returnType).toBe("Number?");
  });

  test("body is literal 3", () => {
    expect(fn.body).toEqual({ kind: "literal", value: 3 });
  });
});

// ── expressions ───────────────────────────────────────────────────────────────

function parseFnBody(expr: string) {
  const src = `defn f signature: from to Number?; expression ${expr}; end`;
  const prog = parseProgram(src);
  return prog.fns[0]!.body;
}

describe("parseProgram: expression — literals", () => {
  test("integer literal", () => {
    expect(parseFnBody("42")).toEqual({ kind: "literal", value: 42 });
  });

  test("decimal literal", () => {
    expect(parseFnBody("3.14")).toEqual({ kind: "literal", value: 3.14 });
  });

  test("string literal", () => {
    expect(parseFnBody("'hello'")).toEqual({ kind: "literal", value: "hello" });
  });

  test("boolean true", () => {
    expect(parseFnBody("true")).toEqual({ kind: "literal", value: true });
  });

  test("boolean false", () => {
    expect(parseFnBody("false")).toEqual({ kind: "literal", value: false });
  });
});

describe("parseProgram: expression — variable", () => {
  test("var reference", () => {
    expect(parseFnBody("myVar")).toEqual({ kind: "var", name: "myVar" });
  });
});

describe("parseProgram: expression — arithmetic", () => {
  test("addition", () => {
    const body = parseFnBody("a + b") as BinaryExpr;
    expect(body.kind).toBe("binary");
    expect(body.op).toBe("+");
    expect(body.left).toEqual({ kind: "var", name: "a" });
    expect(body.right).toEqual({ kind: "var", name: "b" });
  });
});

describe("parseProgram: expression — comparisons", () => {
  test("equal", () => {
    const body = parseFnBody("a == b") as BinaryExpr;
    expect(body.op).toBe("==");
  });

  test("not equal", () => {
    const body = parseFnBody("a != b") as BinaryExpr;
    expect(body.op).toBe("!=");
  });

  test("less than", () => {
    const body = parseFnBody("a < b") as BinaryExpr;
    expect(body.op).toBe("<");
  });

  test("greater than or equal", () => {
    const body = parseFnBody("a >= b") as BinaryExpr;
    expect(body.op).toBe(">=");
  });
});

describe("parseProgram: expression — boolean logic", () => {
  test("and", () => {
    const body = parseFnBody("a && b") as BinaryExpr;
    expect(body.op).toBe("&&");
  });

  test("or", () => {
    const body = parseFnBody("a || b") as BinaryExpr;
    expect(body.op).toBe("||");
  });

  test("unary not", () => {
    const body = parseFnBody("!x") as UnaryExpr;
    expect(body.kind).toBe("unary");
    expect(body.op).toBe("!");
    expect(body.expr).toEqual({ kind: "var", name: "x" });
  });
});

describe("parseProgram: expression — function call", () => {
  test("call with args", () => {
    const body = parseFnBody("sqrt(x)") as CallExpr;
    expect(body.kind).toBe("call");
    expect(body.fn).toBe("sqrt");
    expect(body.args).toHaveLength(1);
    expect(body.args[0]).toEqual({ kind: "var", name: "x" });
  });

  test("call with multiple args", () => {
    const body = parseFnBody("max(a, b)") as CallExpr;
    expect(body.args).toHaveLength(2);
    expect(body.args[0]).toEqual({ kind: "var", name: "a" });
    expect(body.args[1]).toEqual({ kind: "var", name: "b" });
  });
});

describe("parseProgram: expression — field access", () => {
  test("field access", () => {
    const body = parseFnBody("p.x") as FieldExpr;
    expect(body.kind).toBe("field");
    expect(body.field).toBe("x");
    expect(body.object).toEqual({ kind: "var", name: "p" });
  });
});

describe("parseProgram: expression — precedence and nesting", () => {
  test("mul binds tighter than add", () => {
    // a + b * c  →  a + (b * c)
    const body = parseFnBody("a + b * c") as BinaryExpr;
    expect(body.op).toBe("+");
    expect(body.left).toEqual({ kind: "var", name: "a" });
    const right = body.right as BinaryExpr;
    expect(right.op).toBe("*");
    expect(right.left).toEqual({ kind: "var", name: "b" });
    expect(right.right).toEqual({ kind: "var", name: "c" });
  });

  test("nested unary and arithmetic", () => {
    // !a && b
    const body = parseFnBody("!a && b") as BinaryExpr;
    expect(body.op).toBe("&&");
    const left = body.left as UnaryExpr;
    expect(left.kind).toBe("unary");
    expect(left.expr).toEqual({ kind: "var", name: "a" });
  });

  test("call inside binary", () => {
    const body = parseFnBody("f(x) + 1") as BinaryExpr;
    expect(body.op).toBe("+");
    expect((body.left as CallExpr).kind).toBe("call");
    expect((body.right as LiteralExpr).value).toBe(1);
  });
});

// ── defpredicate ──────────────────────────────────────────────────────────────

const predicateSimple = `
defpredicate even?
  signature: from [Number?(x)] to Boolean?;
  expression x == 0;
end
`;

describe("parseProgram: defpredicate basic", () => {
  const prog = parseProgram(predicateSimple);
  const fn = prog.fns[0]!;

  test("isPredicate is true", () => {
    expect(fn.isPredicate).toBe(true);
  });

  test("no error nodes", () => {
    const tree = parser.parse(predicateSimple.trim());
    const cursor = tree.cursor();
    do {
      expect(cursor.name).not.toBe("⚠");
    } while (cursor.next());
  });
});

// ── let bindings ──────────────────────────────────────────────────────────────

const fnWithLet = `
defn compute
  signature: from [Number?(x), Number?(y)] to Number?;
  expression
    let a = x + y;
    let b = a * 2;
    b;
end
`;

describe("parseProgram: let — body is LetExpr", () => {
  const prog = parseProgram(fnWithLet);
  const fn = prog.fns[0]!;

  test("body kind is let", () => {
    expect(fn.body.kind).toBe("let");
  });

  test("two bindings", () => {
    expect((fn.body as LetExpr).bindings).toHaveLength(2);
  });

  test("first binding name", () => {
    expect((fn.body as LetExpr).bindings[0]!.name).toBe("a");
  });

  test("first binding value is binary expr", () => {
    expect((fn.body as LetExpr).bindings[0]!.value.kind).toBe("binary");
  });

  test("second binding name", () => {
    expect((fn.body as LetExpr).bindings[1]!.name).toBe("b");
  });

  test("body is var b", () => {
    expect((fn.body as LetExpr).body).toEqual({ kind: "var", name: "b" });
  });

  test("no error nodes", () => {
    const tree = parser.parse(fnWithLet.trim());
    const cursor = tree.cursor();
    do {
      expect(cursor.name).not.toBe("⚠");
    } while (cursor.next());
  });
});

describe("parseProgram: let — no bindings leaves body as plain Expr", () => {
  const prog = parseProgram(fnSimple);

  test("body kind is binary (not let)", () => {
    expect(prog.fns[0]!.body.kind).toBe("binary");
  });
});

// ── multi-definition document ─────────────────────────────────────────────────

const multiInput = `
defrecord Vec2
  x: Number?;
  y: Number?;
end

defn length
  signature: from [Vec2?(v)] to Number?;
  expression v.x * v.x + v.y * v.y;
end

defnetwork myNet
  signature: from [a] to b;
  propagate f from [a] to b;
end
`;

describe("parseProgram: multi-definition document", () => {
  const prog = parseProgram(multiInput);

  test("network name", () => {
    expect(prog.networks[0]!.name).toBe("myNet");
  });

  test("record name", () => {
    expect(prog.records[0]!.name).toBe("Vec2");
  });

  test("fn name", () => {
    expect(prog.fns[0]!.name).toBe("length");
  });

  test("no error nodes", () => {
    const tree = parser.parse(multiInput.trim());
    const cursor = tree.cursor();
    do {
      expect(cursor.name).not.toBe("⚠");
    } while (cursor.next());
  });
});
