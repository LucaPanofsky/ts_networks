// The FULL in-language tool registry: parse + the program-reasoning operations
// adapted as tools. These live in the operations layer (operations/tools.ts) — not
// the sandbox — so the operations↔sandbox import cycle stays broken. Each tool is a
// thin adapter over its operation; the operation owns the schema, description, and
// logic (full result shapes are pinned in the per-operation tests, e.g.
// tests/operations/run-grammar.test.ts). Here we check registration + forwarding.

import {
  resolveTools,
  toolsFromConfig,
  availableToolNames,
} from "../../src/operations/tools.js";

describe("full registry — advertised tools", () => {
  it("includes parse plus every program-reasoning tool", () => {
    expect(availableToolNames()).toEqual(
      expect.arrayContaining([
        "parse",
        "run-grammar",
        "run-ttable",
        "typecheck",
        "compile-schemas",
        "run",
      ]),
    );
  });

  it("resolves the self-contained parse tool too (composed in, not duplicated logic)", () => {
    expect(resolveTools(["parse"])[0]!.name).toBe("parse");
  });

  it("throws on an unknown tool name", () => {
    expect(() => resolveTools(["nope"])).toThrow(/unknown tool "nope"/);
  });

  it("toolsFromConfig parses + resolves operation-backed names in one step", () => {
    expect(toolsFromConfig("typecheck, run").map(t => t.name)).toEqual(["typecheck", "run"]);
  });
});

describe("run-grammar tool", () => {
  const runGrammarTool = resolveTools(["run-grammar"])[0]!;

  const dsl = `defrecord CitationRec
  title: String?;
  section: String?;
end

defgrammar Citation
  signature: from [String?(text)] to CitationRec?;
  """
Citation {
  cite = title spaces "U.S.C." spaces "§" spaces section
  title = digit+
  section = digit+
}
"""
end
`;

  it("carries the operation's schema (single source of truth)", () => {
    expect(runGrammarTool.input_schema.required).toEqual(["source", "grammar", "input"]);
  });

  // Adapter contract only: the tool forwards its three string inputs to the operation
  // and returns its result unchanged. The success/failure shapes themselves are pinned
  // in tests/operations/run-grammar.test.ts — not re-tested here.
  it("forwards inputs to the operation and returns its result", () => {
    expect(runGrammarTool.run({ source: dsl, grammar: "Citation", input: "17 U.S.C. § 106" })).toEqual({
      ok: true,
      mode: "scalar",
      result: { __type: "CitationRec", title: "17", section: "106" },
    });
  });

  // Boundary — a missing input is coerced to "" rather than throwing on a malformed call.
  it("coerces missing inputs to empty strings", () => {
    const result = runGrammarTool.run({}) as { ok: boolean };
    expect(result.ok).toBe(false);
  });
});

describe("program-reasoning tools — forwarding", () => {
  it("run-ttable forwards source/ttable/input and returns rows", () => {
    const tool = resolveTools(["run-ttable"])[0]!;
    const dsl = `defrecord Pair
  x: String?;
  y: String?;
end

TTable Pairs
  row: Pair;
  cell: '|';
  header x = 'X';
  header y = 'Y';
end
`;
    const result = tool.run({ source: dsl, ttable: "Pairs", input: "X | Y |\na | b |\n" }) as {
      ok: boolean;
      rows?: unknown[];
    };
    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([{ __type: "Pair", x: "a", y: "b" }]);
  });

  it("typecheck forwards source and returns enriched networks", () => {
    const tool = resolveTools(["typecheck"])[0]!;
    const dsl = `defn dbl
  signature: from [Number?(n)] to Number?;
  expression n * 2;
end

defnetwork d
  signature: from [n] to out;
  propagate dbl from [n] to out;
end
`;
    const result = tool.run({ source: dsl }) as { ok: boolean; networks?: unknown[] };
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.networks)).toBe(true);
  });

  it("compile-schemas forwards source and returns a schema per record", () => {
    const tool = resolveTools(["compile-schemas"])[0]!;
    const dsl = `defrecord Point
  x: Number?;
  y: Number?;
end
`;
    const result = tool.run({ source: dsl }) as { ok: boolean; schemas?: Record<string, unknown> };
    expect(result.ok).toBe(true);
    expect(result.schemas).toHaveProperty("Point");
  });

  it("run forwards source/network/cells and executes (async)", async () => {
    const tool = resolveTools(["run"])[0]!;
    const dsl = `defn dbl
  signature: from [Number?(n)] to Number?;
  expression n * 2;
end

defnetwork d
  signature: from [n] to out;
  propagate dbl from [n] to out;
end
`;
    const result = (await tool.run({ source: dsl, network: "d", cells: { n: "21" } })) as {
      ok: boolean;
      cells?: Record<string, unknown>;
    };
    expect(result.ok).toBe(true);
    expect(result.cells?.["out"]).toBe(42);
  });
});
