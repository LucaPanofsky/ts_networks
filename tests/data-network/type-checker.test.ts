import { typeCheck, typeCheckProgram } from "../../src/data-network/type-checker.js";
import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { readFileSync } from "fs";

// ── Happy path ────────────────────────────────────────────────────────────────

describe("typeCheck: happy path — documentPipeline", () => {
  const src = readFileSync("examples/agentic_network_document_analysis_example.tsn", "utf-8");
  const program = parseProgram(src);
  const enriched = typeCheck(program.networks[0]!, program);

  test("no cell errors", () => {
    for (const cell of enriched.cells.values()) {
      console.log(`cell '${cell.name}': writtenBy=${[...cell.writtenBy]}, readBy=${[...cell.readBy]}, errors=${JSON.stringify(cell._errors)}`);
      expect(cell._errors).toHaveLength(0);
    }
  });

  test("no propagator errors", () => {
    for (const prop of enriched.propagators) {
      console.log(`propagator '${prop.fn}': errors=${JSON.stringify(prop._errors)}`);
      expect(prop._errors).toHaveLength(0);
    }
  });

  test("text cell readBy is String?", () => {
    const cell = enriched.cells.get("text")!;
    expect(cell.readBy).toContain("String?");
  });

  test("analysis cell writtenBy is DocumentAnalysis?", () => {
    const cell = enriched.cells.get("analysis")!;
    expect(cell.writtenBy).toContain("DocumentAnalysis?");
  });

  test("label cell writtenBy is ClassificationLabel?", () => {
    const cell = enriched.cells.get("label")!;
    expect(cell.writtenBy).toContain("ClassificationLabel?");
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
  const program = parseProgram(src);
  const enriched = typeCheck(program.networks[0]!, program);

  test("output cell has conflicting-cell-types error", () => {
    const cell = enriched.cells.get("output")!;
    console.log("output cell:", JSON.stringify({ writtenBy: [...cell.writtenBy], errors: cell._errors }));
    expect(cell._errors.some(e => e.kind === "conflicting-cell-types")).toBe(true);
  });

  test("output cell writtenBy has two types", () => {
    const cell = enriched.cells.get("output")!;
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
  const program = parseProgram(src);
  const enriched = typeCheck(program.networks[0]!, program);

  test("middle cell has conflicting-cell-types error", () => {
    const cell = enriched.cells.get("middle")!;
    console.log("middle cell:", JSON.stringify({ writtenBy: [...cell.writtenBy], readBy: [...cell.readBy], errors: cell._errors }));
    expect(cell._errors.some(e => e.kind === "conflicting-cell-types")).toBe(true);
  });

  test("middle cell written as String? but read as Number?", () => {
    const cell = enriched.cells.get("middle")!;
    expect(cell.writtenBy).toContain("String?");
    expect(cell.readBy).toContain("Number?");
  });

  test("consumer propagator has input-type-mismatch error", () => {
    const prop = enriched.propagators.find(p => p.fn === "consumer")!;
    console.log("consumer propagator errors:", JSON.stringify(prop._errors));
    expect(prop._errors.some(e => e.kind === "input-type-mismatch")).toBe(true);
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
  const program = parseProgram(src);
  const enriched = typeCheck(program.networks[0]!, program);
  const prop = enriched.propagators.find(p => p.fn === "weirdFn")!;

  test("propagator has unknown-predicate errors", () => {
    console.log("weirdFn errors:", JSON.stringify(prop._errors));
    expect(prop._errors.some(e => e.kind === "unknown-predicate")).toBe(true);
  });

  test("unknown return type is flagged", () => {
    expect(prop._errors.some(e => e.message.includes("Phantom?"))).toBe(true);
  });

  test("unknown param type is flagged", () => {
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
  const program = parseProgram(src);
  const enriched = typeCheck(program.networks[0]!, program);

  test("no errors", () => {
    for (const cell of enriched.cells.values()) {
      expect(cell._errors).toHaveLength(0);
    }
    for (const prop of enriched.propagators) {
      expect(prop._errors).toHaveLength(0);
    }
  });

  test("flag cell writtenBy is Boolean?", () => {
    const cell = enriched.cells.get("flag")!;
    console.log("flag cell:", JSON.stringify({ writtenBy: [...cell.writtenBy] }));
    expect(cell.writtenBy).toContain("Boolean?");
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
  const program = parseProgram(src);
  const enriched = typeCheck(program.networks[0]!, program);

  test("done cell writtenBy is String?", () => {
    const cell = enriched.cells.get("done")!;
    console.log("done cell:", JSON.stringify({ writtenBy: [...cell.writtenBy] }));
    expect(cell.writtenBy).toContain("String?");
  });

  test("cond cell readBy is Boolean?", () => {
    const cell = enriched.cells.get("cond")!;
    expect(cell.readBy).toContain("Boolean?");
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
  const program = parseProgram(src);
  const enriched = typeCheck(program.networks[0]!, program);

  test("text has empty writtenBy (input cell, no producer)", () => {
    const cell = enriched.cells.get("text")!;
    console.log("text cell:", JSON.stringify({ writtenBy: [...cell.writtenBy], readBy: [...cell.readBy] }));
    expect(cell.writtenBy.size).toBe(0);
  });

  test("text readBy is String? (inferred from consumer)", () => {
    expect(enriched.cells.get("text")!.readBy).toContain("String?");
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
  const program = parseProgram(src);
  const enriched = typeCheck(program.networks[0]!, program);

  test("input cell has conflicting-cell-types error", () => {
    const cell = enriched.cells.get("input")!;
    console.log("input cell:", JSON.stringify({ readBy: [...cell.readBy], errors: cell._errors }));
    expect(cell._errors.some(e => e.kind === "conflicting-cell-types")).toBe(true);
  });

  test("input readBy has two conflicting types", () => {
    expect(enriched.cells.get("input")!.readBy.size).toBe(2);
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
  const program = parseProgram(src);
  const enriched = typeCheck(program.networks[0]!, program);
  const prop = enriched.propagators.find(p => p.fn === "twoArgs")!;

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
  const program = parseProgram(src);
  const results = typeCheckProgram(program);

  test("returns entry for each network", () => {
    console.log("networks:", [...results.keys()]);
    expect(results.has("netA")).toBe(true);
    expect(results.has("netB")).toBe(true);
  });

  test("both networks are well-typed", () => {
    for (const enriched of results.values()) {
      for (const cell of enriched.cells.values()) {
        expect(cell._errors).toHaveLength(0);
      }
    }
  });
});
