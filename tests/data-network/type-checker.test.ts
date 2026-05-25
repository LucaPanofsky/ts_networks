import { typeCheck, typeCheckProgram } from "../../src/data-network/type-checker.js";
import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { readFileSync } from "fs";

// ── Happy path ────────────────────────────────────────────────────────────────

describe("typeCheck: happy path — documentPipeline", () => {
  const src = readFileSync("examples/agentic_network_document_analysis_example.tsn", "utf-8");
  const enriched = typeCheck(parseProgram(src).networks[0]!, parseProgram(src));

  test("no cell errors", () => {
    for (const cell of enriched.cells.values()) expect(cell._errors).toHaveLength(0);
  });

  test("no propagator errors", () => {
    for (const prop of enriched.propagators) expect(prop._errors).toHaveLength(0);
  });

  test("type inference: text, analysis, label cells", () => {
    expect(enriched.cells.get("text")!.readBy).toContain("String?");
    expect(enriched.cells.get("analysis")!.writtenBy).toContain("DocumentAnalysis?");
    expect(enriched.cells.get("label")!.writtenBy).toContain("ClassificationLabel?");
  });
});

// ── Writer conflict ───────────────────────────────────────────────────────────

describe("typeCheck: writer conflict", () => {
  const src = `
defn strFn
  signature: from [Number?(x)] to String?;
  expression 'hello';
end

defn numFn
  signature: from [Number?(x)] to Number?;
  expression x;
end

defnetwork conflict
  signature: from [input] to output;
  propagate strFn from [input] to output;
  propagate numFn from [input] to output;
end
`;
  const cell = typeCheck(parseProgram(src).networks[0]!, parseProgram(src)).cells.get("output")!;

  test("output cell has conflicting-cell-types error and two writer types", () => {
    expect(cell._errors.some(e => e.kind === "conflicting-cell-types")).toBe(true);
    expect(cell.writtenBy.size).toBe(2);
  });
});

// ── Read/write mismatch ───────────────────────────────────────────────────────

describe("typeCheck: read/write mismatch", () => {
  const src = `
defn producer
  signature: from [Number?(x)] to String?;
  expression 'hello';
end

defn consumer
  signature: from [Number?(s)] to Boolean?;
  expression true;
end

defnetwork mismatch
  signature: from [input] to done;
  propagate producer from [input] to middle;
  propagate consumer from [middle] to done;
end
`;
  const enriched = typeCheck(parseProgram(src).networks[0]!, parseProgram(src));

  test("middle cell has type conflict (written as String?, read as Number?)", () => {
    const cell = enriched.cells.get("middle")!;
    expect(cell._errors.some(e => e.kind === "conflicting-cell-types")).toBe(true);
    expect(cell.writtenBy).toContain("String?");
    expect(cell.readBy).toContain("Number?");
  });

  test("consumer propagator has input-type-mismatch error", () => {
    expect(enriched.propagators.find(p => p.fn === "consumer")!._errors
      .some(e => e.kind === "input-type-mismatch")).toBe(true);
  });
});

// ── Unknown predicate ─────────────────────────────────────────────────────────

describe("typeCheck: unknown predicate", () => {
  const src = `
defn weirdFn
  signature: from [Ghost?(x)] to Phantom?;
  expression x;
end

defnetwork ghostnet
  signature: from [input] to output;
  propagate weirdFn from [input] to output;
end
`;
  const prop = typeCheck(parseProgram(src).networks[0]!, parseProgram(src))
    .propagators.find(p => p.fn === "weirdFn")!;

  test("propagator has unknown-predicate errors", () => {
    expect(prop._errors.some(e => e.kind === "unknown-predicate")).toBe(true);
  });

  test("both unknown param and return type are flagged", () => {
    expect(prop._errors.some(e => e.message.includes("Phantom?"))).toBe(true);
    expect(prop._errors.some(e => e.message.includes("Ghost?"))).toBe(true);
  });
});

// ── Switch type propagation ───────────────────────────────────────────────────

describe("typeCheck: switch — 1-arity outputs Boolean?", () => {
  const src = `
defn isGood
  signature: from [String?(x)] to Boolean?;
  expression true;
end

defnetwork switches
  signature: from [input] to flag;
  switch isGood from [input] to flag;
end
`;
  const enriched = typeCheck(parseProgram(src).networks[0]!, parseProgram(src));

  test("no errors", () => {
    for (const cell of enriched.cells.values()) expect(cell._errors).toHaveLength(0);
    for (const prop of enriched.propagators) expect(prop._errors).toHaveLength(0);
  });

  test("flag cell writtenBy is Boolean?", () => {
    expect(enriched.cells.get("flag")!.writtenBy).toContain("Boolean?");
  });
});

describe("typeCheck: switch — 2-arity propagates data cell type", () => {
  const src = `
defn produce
  signature: from [Number?(x)] to String?;
  expression 'hello';
end

defnetwork switches2
  signature: from [input] to done;
  propagate produce from [input] to data;
  switch from [cond, data] to done;
end
`;
  const enriched = typeCheck(parseProgram(src).networks[0]!, parseProgram(src));

  test("done cell writtenBy is String?", () => {
    expect(enriched.cells.get("done")!.writtenBy).toContain("String?");
  });

  test("cond cell readBy is Boolean?", () => {
    expect(enriched.cells.get("cond")!.readBy).toContain("Boolean?");
  });
});

// ── Input cell inference ──────────────────────────────────────────────────────

describe("typeCheck: input cell inferred from consumer", () => {
  const src = `
defn process
  signature: from [String?(text)] to Number?;
  expression 1;
end

defnetwork inputinfer
  signature: from [text] to result;
  propagate process from [text] to result;
end
`;
  const enriched = typeCheck(parseProgram(src).networks[0]!, parseProgram(src));

  test("text has no writers and is inferred as String? from its consumer", () => {
    const cell = enriched.cells.get("text")!;
    expect(cell.writtenBy.size).toBe(0);
    expect(cell.readBy).toContain("String?");
  });

  test("no errors on well-typed input cell", () => {
    expect(enriched.cells.get("text")!._errors).toHaveLength(0);
  });
});

describe("typeCheck: input cell — reader conflict", () => {
  const src = `
defn strConsumer
  signature: from [String?(x)] to Boolean?;
  expression true;
end

defn numConsumer
  signature: from [Number?(x)] to Boolean?;
  expression true;
end

defnetwork readerconflict
  signature: from [input] to done;
  propagate strConsumer from [input] to a;
  propagate numConsumer from [input] to done;
end
`;
  const cell = typeCheck(parseProgram(src).networks[0]!, parseProgram(src)).cells.get("input")!;

  test("input cell has conflicting-cell-types error and two reader types", () => {
    expect(cell._errors.some(e => e.kind === "conflicting-cell-types")).toBe(true);
    expect(cell.readBy.size).toBe(2);
  });
});

// ── Arity mismatch ────────────────────────────────────────────────────────────

describe("typeCheck: arity mismatch", () => {
  const src = `
defn twoArgs
  signature: from [Number?(x), Number?(y)] to Number?;
  expression x;
end

defnetwork aritynet
  signature: from [a] to b;
  propagate twoArgs from [a] to b;
end
`;
  const prop = typeCheck(parseProgram(src).networks[0]!, parseProgram(src))
    .propagators.find(p => p.fn === "twoArgs")!;

  test("propagator has arity-mismatch error", () => {
    expect(prop._errors.some(e => e.kind === "arity-mismatch")).toBe(true);
  });

  test("error message names expected and actual count", () => {
    const err = prop._errors.find(e => e.kind === "arity-mismatch")!;
    expect(err.message).toContain("2");
    expect(err.message).toContain("1");
  });
});

// ── typeCheckProgram ──────────────────────────────────────────────────────────

describe("typeCheckProgram: processes all networks", () => {
  const src = `
defn f
  signature: from [String?(x)] to Number?;
  expression 1;
end

defnetwork netA
  signature: from [a] to b;
  propagate f from [a] to b;
end

defnetwork netB
  signature: from [x] to y;
  propagate f from [x] to y;
end
`;
  const results = typeCheckProgram(parseProgram(src));

  test("returns entry for each network", () => {
    expect(results.has("netA")).toBe(true);
    expect(results.has("netB")).toBe(true);
  });

  test("both networks are well-typed", () => {
    for (const enriched of results.values())
      for (const cell of enriched.cells.values())
        expect(cell._errors).toHaveLength(0);
  });
});
