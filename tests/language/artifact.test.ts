// Artifact round-trip — the staged-convergence step-1 proof. A program is compiled ONCE to a
// self-contained `.js` artifact (`compile-js`), then RUN separately by loading that artifact
// in-process (`run-compiled`). The output must equal the engine `run` operation's output for
// the same network + inputs — i.e. the artifact computes the same thing the in-memory compile
// does. Covers a pure network, a grammar-in-network, and an async llmfn leaf (callLLMFn mocked).

jest.mock("../../src/sandbox/llmfn-client.js", () => ({ callLLMFn: jest.fn() }));

import { callLLMFn } from "../../src/sandbox/llmfn-client.js";
import { run } from "../../src/operations/run.js";
import { compileJs } from "../../src/operations/compile-js.js";
import { runCompiled } from "../../src/operations/run-compiled.js";

const mockCall = callLLMFn as jest.MockedFunction<typeof callLLMFn>;

// Run a network both ways (engine in-memory compile vs compiled artifact) and assert the
// artifact's cells equal the engine run's cells — ALL cells, not just the output, so the
// artifact path is a true superset of `run`.
async function bothMatch(source: string, network: string, cells: Record<string, string>) {
  const eng = await run.handle({ source, network, cells });
  const compiled = compileJs.handle({ source });
  expect(compiled.ok).toBe(true);
  if (!compiled.ok) throw new Error(compiled.error);
  const art = await runCompiled.handle({ code: compiled.code, network, cells });
  expect(eng.ok).toBe(true);
  expect(art.ok).toBe(true);
  if (eng.ok && art.ok) expect(art.cells).toEqual(eng.cells);
  return art;
}

const PURE = `
defn add2
  signature: from [Number?(a), Number?(b)] to Number?;
  expression a + b;
end

defnetwork sum
  signature: from [a, b] to c;
  propagate add2 from [a, b] to c;
end
`;

const GRAMMAR = `
defrecord Pair
  key: String?;
  value: String?;
end

defgrammar Pair
  signature: from [String?(text)] to Pair?;
  """
  Pair {
    pair  = key "=" value
    key   = letter+
    value = digit+
  }
  """
end

defnetwork parsePair
  signature: from [text] to pair;
  propagate grammar/Pair from [text] to pair;
end
`;

const LLM = `
defrecord Analysis
  label: String?;
end

defllmfn classify
  signature: from [String?(text)] to Analysis?;
  user """Classify: {{text}}""";
end

defnetwork qa
  signature: from [text] to result;
  propagate classify from [text] to result;
end
`;

// An llmfn asking for an operation-backed tool (`typecheck`) — only resolvable via the FULL
// program-reasoning resolver, which `run-compiled` injects. The sandbox default would throw.
const LLM_TOOLS = `
defrecord Analysis
  label: String?;
end

defllmfn classify
  signature: from [String?(text)] to Analysis?;
  with: tools = 'typecheck';
  user """Classify: {{text}}""";
end

defnetwork qa
  signature: from [text] to result;
  propagate classify from [text] to result;
end
`;

describe("compiled artifact — compile-js → run-compiled", () => {
  beforeEach(() => mockCall.mockReset());

  test("compile-js emits a self-contained artifact (import + registry + manifest)", () => {
    const r = compileJs.handle({ source: PURE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).toContain('from "@tsn/runtime"');
    expect(r.code).toContain("rt.registry()");
    expect(r.code).toContain("export const __manifest");
    expect(r.networks).toEqual({ sum: { from: ["a", "b"], to: "c" } });
  });

  test("round-trip: a pure network matches the engine run", async () => {
    const art = await bothMatch(PURE, "sum", { a: "2", b: "3" });
    if (art.ok) expect(art.cells.c).toBe(5);
  });

  test("a cell expression can call the program's own fn (sandbox parity with run)", async () => {
    // `add2` is a program fn; seeding `a = add2(1, 1)` exercises the artifact's value scope,
    // and bothMatch confirms it produces the same cells as the engine run (which evaluates
    // cell exprs against its sandbox). Result: a=2, b=3 → c=5.
    const art = await bothMatch(PURE, "sum", { a: "add2(1, 1)", b: "3" });
    if (art.ok) expect(art.cells.c).toBe(5);
  });

  test("round-trip: a grammar-in-network matches the engine run", async () => {
    const art = await bothMatch(GRAMMAR, "parsePair", { text: "'a=1'" });
    if (art.ok) expect(art.cells.pair).toEqual({ __type: "Pair", key: "a", value: "1" });
  });

  test("round-trip: an async llmfn leaf flows through the artifact (callLLMFn mocked)", async () => {
    mockCall.mockResolvedValue({ __type: "Analysis", label: "ok" });
    const art = await bothMatch(LLM, "qa", { text: "'hi'" });
    if (art.ok) expect(art.cells.result).toEqual({ __type: "Analysis", label: "ok" });
  });

  test("an artifact llmfn reaches the full program-reasoning toolset (run-compiled injects it)", async () => {
    mockCall.mockResolvedValue({ __type: "Analysis", label: "ok" });
    const compiled = compileJs.handle({ source: LLM_TOOLS });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const art = await runCompiled.handle({ code: compiled.code, network: "qa", cells: { text: "'hi'" } });
    expect(art.ok).toBe(true);
    if (art.ok) expect(art.cells.result).toEqual({ __type: "Analysis", label: "ok" });
    // The sandbox (parse-only) resolver would have thrown "unknown tool" on `typecheck`; that
    // it resolved — and reached callLLMFn as a tool — proves the full resolver was injected.
    const [, , , config] = mockCall.mock.calls[0]!;
    expect((config as { tools: { name: string }[] }).tools.map((t) => t.name)).toContain("typecheck");
  });

  test("a missing network in the artifact is a clean error", async () => {
    const compiled = compileJs.handle({ source: PURE });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const r = await runCompiled.handle({ code: compiled.code, network: "nope", cells: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found in the artifact/);
  });
});
