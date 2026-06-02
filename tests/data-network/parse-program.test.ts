import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { parser } from "../../src/data-network/parser.js";
import type { BinaryExpr, CallExpr, FieldExpr, FnAST, LetExpr, MatchExpr, RecordAST, UnaryExpr } from "../../src/data-network/types.js";

function noErrorNodes(src: string) {
  const tree = parser.parse(src.trim());
  const cursor = tree.cursor();
  do { expect(cursor.name).not.toBe("⚠"); } while (cursor.next());
}

function parseFnBody(expr: string) {
  return parseProgram(`defn f signature: from to Number?; expression ${expr}; end`).fns[0]!.body;
}

// ── defrecord ─────────────────────────────────────────────────────────────────

const recordInput = `
defrecord Point
  x: Number?;
  y: Number?;
  label: String?;
end
`;

describe("parseProgram: defrecord", () => {
  const rec = parseProgram(recordInput).records[0]! as RecordAST;

  test("structure", () => {
    expect(rec.name).toBe("Point");
    expect(rec.fields).toEqual([
      { name: "x",     type: { kind: "scalar", predicate: "Number?" } },
      { name: "y",     type: { kind: "scalar", predicate: "Number?" } },
      { name: "label", type: { kind: "scalar", predicate: "String?" } },
    ]);
  });

  test("no error nodes", () => noErrorNodes(recordInput));
});

// ── defn ──────────────────────────────────────────────────────────────────────

const fnSimple = `
defn add
  signature: from [Number?(x), Number?(y)] to Number?;
  expression x + y;
end
`;

describe("parseProgram: defn", () => {
  const fn = parseProgram(fnSimple).fns[0]! as FnAST;

  test("structure", () => {
    expect(fn.name).toBe("add");
    expect(fn.isPredicate).toBe(false);
    expect(fn.params).toEqual([
      { predicate: "Number?", name: "x" },
      { predicate: "Number?", name: "y" },
    ]);
    expect(fn.returnType).toEqual({ kind: "scalar", predicate: "Number?" });
  });

  test("body", () => {
    expect(fn.body).toEqual({
      kind: "binary", op: "+",
      left:  { kind: "var", name: "x" },
      right: { kind: "var", name: "y" },
    });
  });

  test("no error nodes", () => noErrorNodes(fnSimple));
});

// ── defn — no params ─────────────────────────────────────────────────────────

const fnNoParams = `
defn pi
  signature: from to Number?;
  expression 3;
end
`;

describe("parseProgram: defn no params", () => {
  test("empty params and return type", () => {
    const fn = parseProgram(fnNoParams).fns[0]!;
    expect(fn.params).toHaveLength(0);
    expect(fn.returnType).toEqual({ kind: "scalar", predicate: "Number?" });
  });

  test("body is literal", () => {
    expect(parseProgram(fnNoParams).fns[0]!.body).toEqual({ kind: "literal", value: 3 });
  });
});

// ── expressions ───────────────────────────────────────────────────────────────

describe("parseProgram: expression — literals", () => {
  test("number literals (integer and decimal)", () => {
    expect(parseFnBody("42")).toEqual({ kind: "literal", value: 42 });
    expect(parseFnBody("3.14")).toEqual({ kind: "literal", value: 3.14 });
  });

  test("string literal", () => {
    expect(parseFnBody("'hello'")).toEqual({ kind: "literal", value: "hello" });
  });

  test("boolean literals", () => {
    expect(parseFnBody("true")).toEqual({ kind: "literal", value: true });
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
    expect(parseFnBody("a + b")).toEqual({
      kind: "binary", op: "+",
      left:  { kind: "var", name: "a" },
      right: { kind: "var", name: "b" },
    });
  });
});

describe("parseProgram: expression — comparisons", () => {
  test("equality operator", () => {
    expect((parseFnBody("a == b") as BinaryExpr).op).toBe("==");
  });

  test("greater-than-or-equal operator", () => {
    expect((parseFnBody("a >= b") as BinaryExpr).op).toBe(">=");
  });
});

describe("parseProgram: expression — boolean logic", () => {
  test("logical and", () => {
    expect((parseFnBody("a && b") as BinaryExpr).op).toBe("&&");
  });

  test("unary not", () => {
    const body = parseFnBody("!x") as UnaryExpr;
    expect(body.kind).toBe("unary");
    expect(body.op).toBe("!");
    expect(body.expr).toEqual({ kind: "var", name: "x" });
  });
});

describe("parseProgram: expression — call", () => {
  test("call with multiple args", () => {
    const body = parseFnBody("max(a, b)") as CallExpr;
    expect(body.kind).toBe("call");
    expect(body.fn).toBe("max");
    expect(body.args).toEqual([
      { kind: "var", name: "a" },
      { kind: "var", name: "b" },
    ]);
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

describe("parseProgram: expression — precedence", () => {
  test("mul binds tighter than add", () => {
    const body = parseFnBody("a + b * c") as BinaryExpr;
    expect(body.op).toBe("+");
    expect((body.right as BinaryExpr).op).toBe("*");
  });

  test("unary binds tighter than logical", () => {
    const body = parseFnBody("!a && b") as BinaryExpr;
    expect(body.op).toBe("&&");
    expect((body.left as UnaryExpr).kind).toBe("unary");
  });
});

// ── defpredicate ──────────────────────────────────────────────────────────────

const predicateSimple = `
defpredicate even?
  signature: from [Number?(x)] to Boolean?;
  expression x == 0;
end
`;

describe("parseProgram: defpredicate", () => {
  test("isPredicate is true", () => {
    expect(parseProgram(predicateSimple).fns[0]!.isPredicate).toBe(true);
  });

  test("no error nodes", () => noErrorNodes(predicateSimple));
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

describe("parseProgram: let", () => {
  test("structure", () => {
    const body = parseProgram(fnWithLet).fns[0]!.body as LetExpr;
    expect(body.kind).toBe("let");
    expect(body.bindings).toEqual([
      { name: "a", value: { kind: "binary", op: "+", left: { kind: "var", name: "x" }, right: { kind: "var", name: "y" } } },
      { name: "b", value: { kind: "binary", op: "*", left: { kind: "var", name: "a" }, right: { kind: "literal", value: 2 } } },
    ]);
    expect(body.body).toEqual({ kind: "var", name: "b" });
  });

  test("no error nodes", () => noErrorNodes(fnWithLet));
});

describe("parseProgram: let — no bindings leaves body as plain Expr", () => {
  test("body kind is binary (not let)", () => {
    expect(parseProgram(fnSimple).fns[0]!.body.kind).toBe("binary");
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
  test("all definitions parsed", () => {
    const prog = parseProgram(multiInput);
    expect(prog.networks[0]!.name).toBe("myNet");
    expect(prog.records[0]!.name).toBe("Vec2");
    expect(prog.fns[0]!.name).toBe("length");
  });

  test("no error nodes", () => noErrorNodes(multiInput));
});

// ── derive ────────────────────────────────────────────────────────────────────

const deriveInput = `
derive Student? from Person?;
derive GradStudent? from Student?;
`;

describe("parseProgram: derive", () => {
  test("structure", () => {
    expect(parseProgram(deriveInput).derives).toEqual([
      { kind: "derive", sub: "Student?",    sup: "Person?"  },
      { kind: "derive", sub: "GradStudent?", sup: "Student?" },
    ]);
  });

  test("no error nodes", () => noErrorNodes(deriveInput));
});

describe("parseProgram: derive alongside other definitions", () => {
  const mixed = `
defrecord Person
  name: String?;
end

derive Student? from Person?;
`;

  test("record and derive both parsed", () => {
    const prog = parseProgram(mixed);
    expect(prog.records[0]!.name).toBe("Person");
    expect(prog.derives[0]!.sub).toBe("Student?");
  });

  test("derives array empty when absent", () => {
    expect(parseProgram("defrecord Foo\n  x: Number?;\nend").derives).toHaveLength(0);
  });
});

// ── match expression ──────────────────────────────────────────────────────────

const matchDsl = `
defn classify
  signature: from [Shape?(s)] to String?;
  expression
    match s
      | Circle { radius: r } when r > 10 -> 'large'
      | Circle { radius: r } -> 'small'
      | _ -> 'other'
    end;
end
`;

describe("parseProgram: match expression", () => {
  test("no parse errors", () => noErrorNodes(matchDsl));

  test("body kind, subject, arm count", () => {
    const body = parseProgram(matchDsl).fns[0]!.body as MatchExpr;
    expect(body.kind).toBe("match");
    expect(body.subject).toEqual({ kind: "var", name: "s" });
    expect(body.arms).toHaveLength(3);
  });

  test("first arm: record pattern with guard", () => {
    const arm = (parseProgram(matchDsl).fns[0]!.body as MatchExpr).arms[0]!;
    expect(arm.pattern).toEqual({ kind: "record-pattern", recordName: "Circle", bindings: [{ field: "radius", as: "r" }] });
    expect(arm.guard).not.toBeNull();
    expect(arm.guard!.kind).toBe("binary");
    expect(arm.body).toEqual({ kind: "literal", value: "large" });
  });

  test("wildcard arm", () => {
    const arm = (parseProgram(matchDsl).fns[0]!.body as MatchExpr).arms[2]!;
    expect(arm.pattern.kind).toBe("wildcard");
    expect(arm.guard).toBeNull();
    expect(arm.body).toEqual({ kind: "literal", value: "other" });
  });
});

// ── defllmfn ──────────────────────────────────────────────────────────────────

const llmFnDsl = `
defllmfn analyzeDocument
  signature: from [String?(text)] to String?;
  with: model = 'claude-opus-4-7', max_tokens = '4096';
  """
  # Task

  Analyze the text: {{text}}

  Return a value like "positive", "negative", or "neutral".
  Use "neutral" as the default when unsure.
  """;
end
`;

describe("parseProgram: defllmfn", () => {
  const llmFn = parseProgram(llmFnDsl).llmFns[0]!;

  test("no parse errors", () => noErrorNodes(llmFnDsl));

  test("name, params, returnType", () => {
    expect(llmFn.name).toBe("analyzeDocument");
    expect(llmFn.params).toEqual([{ predicate: "String?", name: "text" }]);
    expect(llmFn.returnType).toEqual({ kind: "scalar", predicate: "String?" });
  });

  test("config", () => {
    expect(llmFn.config).toEqual({ model: "claude-opus-4-7", max_tokens: "4096" });
  });

  test("prompt contains expected content", () => {
    expect(llmFn.prompt).toContain("# Task");
    expect(llmFn.prompt).toContain("{{text}}");
    expect(llmFn.prompt).toContain('"neutral"');
  });

  test("prompt strips surrounding triple-quotes", () => {
    expect(llmFn.prompt.startsWith('"""')).toBe(false);
    expect(llmFn.prompt.endsWith('"""')).toBe(false);
  });
});

// ── defgrammar ──────────────────────────────────────────────────────────────────

const grammarDsl = `
defgrammar Citation
  """
  Citation {
    cite          = title "U.S.C." section
    title         = digit+
    section       = "§" spaces sectionNumber
    sectionNumber = digit+ subsec*
    subsec        = "(" alnum+ ")"
  }
  """
end
`;

describe("parseProgram: defgrammar", () => {
  const grammar = parseProgram(grammarDsl).grammars[0]!;

  test("no parse errors", () => noErrorNodes(grammarDsl));

  test("kind and name", () => {
    expect(grammar.kind).toBe("grammar");
    expect(grammar.name).toBe("Citation");
  });

  test("source is captured verbatim", () => {
    expect(grammar.source).toContain("Citation {");
    expect(grammar.source).toContain(`cite          = title "U.S.C." section`);
    expect(grammar.source).toContain("§");
  });

  test("source strips the surrounding triple-quotes", () => {
    expect(grammar.source.startsWith('"""')).toBe(false);
    expect(grammar.source.endsWith('"""')).toBe(false);
  });
});

// ── defenum ───────────────────────────────────────────────────────────────────

const enumInput = `
defenum DocumentType
  'report', 'email', 'legal', 'technical';
end
`;

describe("parseProgram: defenum", () => {
  test("structure", () => {
    const en = parseProgram(enumInput).enums[0]!;
    expect(en.kind).toBe("enum");
    expect(en.name).toBe("DocumentType");
    expect(en.values).toEqual(["report", "email", "legal", "technical"]);
  });

  test("no error nodes", () => noErrorNodes(enumInput));
});

describe("parseProgram: defenum alongside other definitions", () => {
  const mixed = `
defrecord Payload
  label: String?;
end

defenum Status
  'active', 'inactive';
end
`;

  test("record and enum both parsed", () => {
    const prog = parseProgram(mixed);
    expect(prog.records[0]!.name).toBe("Payload");
    expect(prog.enums[0]!.name).toBe("Status");
    expect(prog.enums[0]!.values).toEqual(["active", "inactive"]);
  });
});

// ── keyword-prefix identifiers ────────────────────────────────────────────────

describe("keyword-prefix identifiers", () => {
  const src = `
defrecord Segment
  fromPoint: Number?;
  toPoint: Number?;
  withColor: Number?;
  endTime: Number?;
end
`.trim();

  test("no error nodes", () => {
    let hasError = false;
    parser.parse(src).iterate({ enter: n => { if (n.name === "⚠") hasError = true; } });
    expect(hasError).toBe(false);
  });

  test("field names are parsed whole", () => {
    expect(parseProgram(src).records[0]!.fields.map(f => f.name))
      .toEqual(["fromPoint", "toPoint", "withColor", "endTime"]);
  });
});
