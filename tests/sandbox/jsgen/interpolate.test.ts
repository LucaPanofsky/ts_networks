import { compile } from "../../../src/sandbox/jsgen/index.js";

// The `interpolate """..."""` function body: a defn whose value is a String assembled
// by substituting `{{path}}` placeholders against its arguments, through the same
// renderer (`renderPrompt`) that backs defllmfn prompts. These are end-to-end:
// source → parse → compile → call the materialized JS function.

// ── Capability: the motivating case — assemble a grammar string from a record ──

const grammarBuilderDsl = `
defrecord GrammarFields
  point: String?;
  label: String?;
  body: String?;
  mark: String?;
end

defn makeGrammarString
  signature: from [GrammarFields(rec)] to String?;
  interpolate """
  Point {
    point = {{rec.point}}
    label = {{rec.label}}
    body  = {{rec.body}}
    mark  = {{rec.mark}}
  }
  """;
end
`;

describe("interpolate body — assembling a grammar string", () => {
  const { sandbox } = compile(grammarBuilderDsl);
  const make = sandbox["makeGrammarString"] as (rec: Record<string, unknown>) => string;
  const out = make({ point: "digit+", label: "(~newline any)+", body: "any*", mark: "\"END\"" });

  it("substitutes every dotted placeholder with the record's fields", () => {
    expect(out).toContain("point = digit+");
    expect(out).toContain("label = (~newline any)+");
    expect(out).toContain("body  = any*");
    expect(out).toContain('mark  = "END"');
  });

  it("passes literal single braces through untouched", () => {
    // `Point {` and the closing `}` are not placeholders and must survive verbatim.
    expect(out).toContain("Point {");
    expect(out.trimEnd().endsWith("}")).toBe(true);
  });
});

// ── Capability: bare (non-dotted) placeholder over scalar params ──

const greetDsl = `
defn greet
  signature: from [String?(name), String?(lang)] to String?;
  interpolate """Hello {{name}} ({{lang}})""";
end
`;

describe("interpolate body — bare placeholders over scalar params", () => {
  const { sandbox } = compile(greetDsl);
  const greet = sandbox["greet"] as (name: string, lang: string) => string;

  it("substitutes bare identifiers in argument order", () => {
    expect(greet("Luca", "it")).toBe("Hello Luca (it)");
  });
});

// ── Invariant: same serializer as defllmfn — a record-valued hole renders as JSON ──

const jsonHoleDsl = `
defrecord Pair
  a: String?;
  b: String?;
end

defn dump
  signature: from [Pair(p)] to String?;
  interpolate """value: {{p}}""";
end
`;

describe("interpolate body — serializer consistency with defllmfn", () => {
  const { sandbox } = compile(jsonHoleDsl);
  const dump = sandbox["dump"] as (p: Record<string, unknown>) => string;

  it("renders a whole-record placeholder as JSON, never [object Object]", () => {
    const out = dump({ __type: "Pair", a: "1", b: "2" });
    expect(out).toContain('"a": "1"');
    expect(out).not.toContain("[object Object]");
  });
});

// ── Negative: a placeholder whose path cannot be resolved fails loud at call time ──
// (A reachable root but an absent sub-key — the renderer's missing-variable safety
// net. The type-checker will later reject this statically; until then it must not
// render a silent gap.)

const badPathDsl = `
defrecord Box
  v: String?;
end

defn leak
  signature: from [Box(box)] to String?;
  interpolate """got {{box.nope}}""";
end
`;

describe("interpolate body — unresolved path", () => {
  const { sandbox } = compile(badPathDsl);
  const leak = sandbox["leak"] as (box: Record<string, unknown>) => string;

  it("throws referencing the undefined variable rather than rendering a gap", () => {
    expect(() => leak({ v: "x" })).toThrow(/references undefined variable\(s\): box\.nope/);
  });
});
