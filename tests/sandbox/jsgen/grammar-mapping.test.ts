import { compile } from "../../../src/sandbox/jsgen/index.js";
import { Something, Nothing, Contradiction } from "../../../src/info-structure.js";

// Documents the behaviour of mapping a record-returning defn that calls a grammar
// (`grammar/PointScan`) over a vector of records, where SOME elements produce an
// empty grammar result (`[]`). The algebra (merge / I / naryUnpacking) is taken as
// correct: these tests pin down what `enrichParagraph` and `as mapping` actually do
// so any wrong result is located in an implementation, not blamed on the algebra.

const dsl = `
defrecord Point
  label: String?;
  body:  String?;
end

defgrammar PointScan
  signature: from [String?(text)] to [Point?];
  """
  PointScan {
    point = "(" label ")" spaces body
    label = "a".."z"
    body  = (~mark any)*
    mark  = "(" label ")"
  }
  """
end

defrecord Paragraph
  body:   String?;
  points: [Point?];
end

defn enrichParagraph
  signature: from [Paragraph?(p)] to Paragraph?;
  expression Paragraph(p.body, grammar/PointScan(p.body));
end

defnetwork enrichOne
  signature: from [p] to out;
  propagate enrichParagraph from [p] to out;
end

defnetwork enrichAll
  signature: from [ps] to out;
  propagate enrichParagraph as mapping from [ps] to out;
end
`;

const program = compile(dsl);
const enrichOne = program.networks.get("enrichOne")!;
const enrichAll = program.networks.get("enrichAll")!;

const para = (body: string) => ({ __type: "Paragraph", body, points: [] });

const out = (net: typeof enrichOne, cell: string, inputs: Record<string, unknown>) =>
  net.invoke(inputs).cells.get(cell)!.knows();

// ── Single paragraph (no mapping) ───────────────────────────────────────────────

describe("enrichParagraph applied to one paragraph", () => {
  test("a paragraph WITH points enriches to a Paragraph carrying those points", () => {
    const r = out(enrichOne, "out", { p: para("(a) alpha; (b) beta") });
    expect(r).toBeInstanceOf(Something);
    const v = (r as Something<{ points: unknown[] }>).content();
    expect(v.points.map((pt: any) => pt.label)).toEqual(["a", "b"]);
  });

  test("a paragraph WITHOUT points enriches to a Paragraph with an empty points list", () => {
    const r = out(enrichOne, "out", { p: para("plain text, no points here") });
    expect(r).toBeInstanceOf(Something);
    const v = (r as Something<{ points: unknown[] }>).content();
    expect(v.points).toEqual([]);
  });
});

// ── Mapping over the vector ─────────────────────────────────────────────────────

describe("enrichParagraph as mapping over [Paragraph?]", () => {
  test("every element has points → a vector of enriched paragraphs", () => {
    const r = out(enrichAll, "out", { ps: [para("(a) x"), para("(b) y; (c) z")] });
    expect(r).toBeInstanceOf(Something);
    const v = (r as Something<any[]>).content();
    expect(v.map(p => p.points.length)).toEqual([1, 2]);
  });

  test("a mix of with-points and without-points elements → all paragraphs preserved", () => {
    const r = out(enrichAll, "out", { ps: [para("(a) x"), para("no points")] });
    expect(r).toBeInstanceOf(Something);
    const v = (r as Something<any[]>).content();
    expect(v.map(p => p.points.length)).toEqual([1, 0]);
  });
});

// ── Chained: a grammar SCAN output feeding the mapping (the real pipeline) ───────
// This is the only structural difference from the passing cases above: the vector
// fed to `as mapping` is produced by another propagator (`grammar/ParaScan`) rather
// than seeded directly. It reproduces the `∅` seen in repo_workspace/examples/article33_experiment.

const chainDsl = `
defrecord Point
  label: String?;
  body:  String?;
end

defgrammar PointScan
  signature: from [String?(text)] to [Point?];
  """
  PointScan {
    point = "(" label ")" spaces body
    label = "a".."z"
    body  = (~mark any)*
    mark  = "(" label ")"
  }
  """
end

defrecord Paragraph
  number: String?;
  body:   String?;
  points: [Point?];
end

defgrammar ParaScan
  signature: from [String?(text)] to [Paragraph?];
  """
  ParaScan {
    paragraph = number "." spaces body
    number    = digit+
    body      = (~paraMark any)+
    paraMark  = digit+ "."
  }
  """
end

defn enrichParagraph
  signature: from [Paragraph?(p)] to Paragraph?;
  expression Paragraph(p.number, p.body, grammar/PointScan(p.body));
end

defnetwork pipeline
  signature: from [text] to out;
  propagate grammar/ParaScan from [text] to raw;
  propagate enrichParagraph as mapping from [raw] to out;
end

defnetwork mapSeeded
  signature: from [ps] to out;
  propagate enrichParagraph as mapping from [ps] to out;
end

defn paraNumber
  signature: from [Paragraph?(p)] to String?;
  expression p.number;
end

defnetwork pipelinePlain
  signature: from [text] to out;
  propagate grammar/ParaScan from [text] to raw;
  propagate paraNumber as mapping from [raw] to out;
end
`;

const chainProgram = compile(chainDsl);
const chain = chainProgram.networks.get("pipeline")!;
const mapSeeded = chainProgram.networks.get("mapSeeded")!;
const pipelinePlain = chainProgram.networks.get("pipelinePlain")!;
const para3 = (number: string, body: string) => ({ __type: "Paragraph", number, body, points: [] });

describe("chained: grammar/ParaScan output feeding enrichParagraph as mapping", () => {
  test("the intermediate scan cell holds the [Paragraph?] vector", () => {
    const raw = chain.invoke({ text: "1. plain.\n\n2. has (a) x." }).cells.get("raw")!.knows();
    expect(raw).toBeInstanceOf(Something);
    expect((raw as Something<any[]>).content().map(p => p.number)).toEqual(["1", "2"]);
  });

  // REGRESSION (was a known bug, now fixed): a vector produced by a grammar SCAN
  // propagator and then consumed by an `as mapping` propagator in the SAME network
  // used to collapse to a Contradiction, because the runner enqueued the mapping
  // propagator twice (initial rank + producer push) and re-firing produced a fresh
  // array that failed reference-equality merge. Fixed by deduplicating the runner
  // worklist (src/network-impl/runner.ts). The algebra is unchanged.
  test("mapping over the scanned vector yields the enriched paragraphs", () => {
    const r = chain.invoke({ text: "1. plain.\n\n2. has (a) x." }).cells.get("out")!.knows();
    expect(r).toBeInstanceOf(Something);
    const v = (r as Something<any[]>).content();
    expect(v.map(p => p.number)).toEqual(["1", "2"]);
    expect(v.map(p => p.points.length)).toEqual([0, 1]);
  });

  test("ISOLATION: same program, but the vector is SEEDED (not scanned)", () => {
    const r = mapSeeded.invoke({ ps: [para3("1", "plain."), para3("2", "has (a) x.")] }).cells.get("out")!.knows();
    expect(r).toBeInstanceOf(Something);
    const v = (r as Something<any[]>).content();
    expect(v.map(p => p.points.length)).toEqual([0, 1]);
  });

  test("ISOLATION 2: take the SCANNED vector and feed it as a SEEDED input", () => {
    const raw = (chain.invoke({ text: "1. plain.\n\n2. has (a) x." }).cells.get("raw")!.knows() as Something<any[]>).content();
    // Inspect the scanned element shape directly.
    expect(typeof raw[0].body).toBe("string");
    expect(Array.isArray(raw[0].points)).toBe(true);
    // Does the scanned VALUE itself drive the mapping to a Contradiction?
    const r = mapSeeded.invoke({ ps: raw }).cells.get("out")!.knows();
    expect(r).toBeInstanceOf(Something);
  });

  // Same fix, reduced to the minimum: scan → mapping with a plain field-access fn.
  test("ISOLATION 3: scan→mapping where the mapped fn makes NO grammar call (no grammar-in-expression involved)", () => {
    const r = pipelinePlain.invoke({ text: "1. plain.\n\n2. also." }).cells.get("out")!.knows();
    expect(r).toBeInstanceOf(Something);
    expect((r as Something<unknown[]>).content()).toEqual(["1", "2"]);
  });
});
