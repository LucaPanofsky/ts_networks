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

// INVARIANT — the layering that keeps the operations↔sandbox cycle broken. The
// sandbox tool registry must know ONLY the self-contained `parse` tool; the
// operation-backed tools (run-grammar, typecheck, run, …) are injected from the
// operations layer (see tests/operations/tools.test.ts) and must NOT leak down
// into the sandbox registry. If someone re-adds an operations import to
// src/sandbox/tools.ts to "just register them here", these assertions fail.
describe("sandbox registry is parse-only (cycle invariant)", () => {
  it("advertises exactly [parse] — no operation-backed tools", () => {
    expect(availableToolNames()).toEqual(["parse"]);
  });

  it("cannot resolve an operation-backed tool from the sandbox layer", () => {
    expect(() => resolveTools(["typecheck"])).toThrow(/unknown tool "typecheck"/);
    expect(() => resolveTools(["run-grammar"])).toThrow(/unknown tool "run-grammar"/);
    expect(() => resolveTools(["run"])).toThrow(/unknown tool "run"/);
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
