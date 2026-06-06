import {
  parseToolList,
  resolveTools,
  toolsFromConfig,
  availableToolNames,
} from "../../src/sandbox/tools.js";
import { parseProgram } from "../../src/data-network/tree-to-network.js";

const VALID_TSN = `defrecord Point
  x: Number?;
  y: Number?;
end
`;

const INVALID_TSN = "this is not valid tsn @@@";

describe("parseToolList — capabilities", () => {
  it("splits a comma-separated list, trimming whitespace", () => {
    expect(parseToolList("a, b ,  c")).toEqual(["a", "b", "c"]);
  });

  it("handles a single name", () => {
    expect(parseToolList("parse")).toEqual(["parse"]);
  });
});

describe("parseToolList — invariants & boundaries", () => {
  it("returns [] for an empty or whitespace-only value", () => {
    expect(parseToolList("")).toEqual([]);
    expect(parseToolList("   ")).toEqual([]);
  });

  it("drops empty segments from stray commas", () => {
    expect(parseToolList("a,,b,")).toEqual(["a", "b"]);
  });

  it("de-duplicates while preserving first-seen order", () => {
    expect(parseToolList("b, a, b, a")).toEqual(["b", "a"]);
  });
});

describe("resolveTools", () => {
  it("resolves a known tool to its definition", () => {
    const tools = resolveTools(["parse"]);
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("parse");
    expect(tools[0]!.input_schema.required).toEqual(["source"]);
  });

  // Negative — an unknown name is an error, not a silent skip.
  it("throws on an unknown tool name", () => {
    expect(() => resolveTools(["nope"])).toThrow(/unknown tool "nope"/);
  });

  it("throws if any name in the list is unknown", () => {
    expect(() => resolveTools(["parse", "nope"])).toThrow(/unknown tool/);
  });
});

describe("toolsFromConfig", () => {
  it("returns [] when no tools are configured", () => {
    expect(toolsFromConfig(undefined)).toEqual([]);
    expect(toolsFromConfig("")).toEqual([]);
  });

  it("parses and resolves in one step, de-duplicating", () => {
    expect(toolsFromConfig("parse, parse").map(t => t.name)).toEqual(["parse"]);
  });
});

describe("parse tool", () => {
  const parse = resolveTools(["parse"])[0]!;

  it("is advertised in the registry", () => {
    expect(availableToolNames()).toContain("parse");
  });

  // Capability — valid source.
  it("reports ok for a syntactically valid program", () => {
    expect(parse.run({ source: VALID_TSN })).toEqual({ ok: true });
  });

  // Negative — invalid source returns a structured error rather than throwing.
  it("reports the syntax error for invalid source", () => {
    const result = parse.run({ source: INVALID_TSN }) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Syntax error/);
  });

  // Boundary — a missing source is treated as empty input (an empty program is
  // itself valid), so the tool never throws on a malformed call.
  it("treats a missing source as empty input", () => {
    expect(parse.run({})).toEqual({ ok: true });
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

  it("is advertised in the registry", () => {
    expect(availableToolNames()).toContain("run-grammar");
  });

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

describe("program-reasoning tools — advertised and forwarding", () => {
  // Each is a thin adapter over its operation (schema + description + logic owned by the
  // operation, pinned in tests/operations/*). Here we only check it is registered and
  // forwards its inputs. The full result shapes live in the operation tests.

  it("advertises typecheck, compile-schemas, run, and run-ttable", () => {
    const names = availableToolNames();
    expect(names).toEqual(expect.arrayContaining(["typecheck", "compile-schemas", "run", "run-ttable"]));
  });

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

describe("with: tools clause (language integration)", () => {
  // No grammar change: the generic `with:` clause already carries `tools`.
  it("lands the tools value in the llmFn config", () => {
    const prog = parseProgram(
      `defllmfn writeProgram\n` +
        `  signature: from [String?(spec)] to String?;\n` +
        `  with: model = 'claude-opus-4-7', tools = 'parse';\n` +
        `  """Write a program for {{spec}}""";\n` +
        `end\n`,
    );
    expect(prog.llmFns[0]!.config["tools"]).toBe("parse");
  });
});
