import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { parser } from "../../src/data-network/parser.js";
import type { BinaryExpr, CallExpr, FieldExpr, FnAST, LiteralExpr, RecordAST, UnaryExpr, VarExpr } from "../../src/data-network/types.js";

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

  test("record count", () => {
    expect(prog.records).toHaveLength(1);
  });

  test("record kind", () => {
    expect(rec.kind).toBe("record");
  });

  test("record name", () => {
    expect(rec.name).toBe("Point");
  });

  test("field count", () => {
    expect(rec.fields).toHaveLength(3);
  });

  test("first field name", () => {
    expect(rec.fields[0]!.name).toBe("x");
  });

  test("first field predicate", () => {
    expect(rec.fields[0]!.predicate).toBe("Number?");
  });

  test("second field", () => {
    expect(rec.fields[1]).toEqual({ name: "y", predicate: "Number?" });
  });

  test("third field", () => {
    expect(rec.fields[2]).toEqual({ name: "label", predicate: "String?" });
  });
});

describe("parseProgram: defrecord parse tree is clean", () => {
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

  test("fn count", () => {
    expect(prog.fns).toHaveLength(1);
  });

  test("fn kind", () => {
    expect(fn.kind).toBe("fn");
  });

  test("fn name", () => {
    expect(fn.name).toBe("add");
  });

  test("param count", () => {
    expect(fn.params).toHaveLength(2);
  });

  test("first param predicate", () => {
    expect(fn.params[0]!.predicate).toBe("Number?");
  });

  test("first param name", () => {
    expect(fn.params[0]!.name).toBe("x");
  });

  test("second param", () => {
    expect(fn.params[1]).toEqual({ predicate: "Number?", name: "y" });
  });

  test("return type", () => {
    expect(fn.returnType).toBe("Number?");
  });

  test("body is binary expr", () => {
    expect(fn.body.kind).toBe("binary");
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
});

describe("parseProgram: defn parse tree is clean", () => {
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

  test("subtraction", () => {
    const body = parseFnBody("a - b") as BinaryExpr;
    expect(body.op).toBe("-");
  });

  test("multiplication", () => {
    const body = parseFnBody("a * b") as BinaryExpr;
    expect(body.op).toBe("*");
  });

  test("division", () => {
    const body = parseFnBody("a / b") as BinaryExpr;
    expect(body.op).toBe("/");
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

  test("one network", () => {
    expect(prog.networks).toHaveLength(1);
  });

  test("one record", () => {
    expect(prog.records).toHaveLength(1);
  });

  test("one fn", () => {
    expect(prog.fns).toHaveLength(1);
  });

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
