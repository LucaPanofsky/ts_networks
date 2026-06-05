import { run } from "../../src/operations/run.js";
import { callLLMFn } from "../../src/sandbox/llmfn-client.js";

// The run operation must drive the ASYNC runtime, so a network with an async leaf
// (an llmfn) resolves to a real value rather than an unresolved APromise (which the
// caller would see as `∅`). The llmfn client is mocked so no real API call is made.
jest.mock("../../src/sandbox/llmfn-client.js", () => ({ callLLMFn: jest.fn() }));
const mockCall = callLLMFn as jest.MockedFunction<typeof callLLMFn>;

const llmDsl = `
defllmfn analyzeText
  signature: from [String?(text)] to String?;
  """Analyze: {{text}}""";
end

defnetwork analyze
  signature: from [text] to strategy;
  propagate analyzeText from [text] to strategy;
end
`;

describe("run operation: async llmfn leaves", () => {
  test("awaits the llmfn and returns the resolved cell value", async () => {
    mockCall.mockResolvedValue("EXTRACTION STRATEGY");
    const result = await run.handle({ source: llmDsl, network: "analyze", cells: { text: "'hi'" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cells["strategy"]).toBe("EXTRACTION STRATEGY");
  });
});

describe("run operation: synchronous networks still work through the async run", () => {
  const syncDsl = `
defn dbl
  signature: from [Number?(n)] to Number?;
  expression n * 2;
end

defnetwork d
  signature: from [n] to out;
  propagate dbl from [n] to out;
end
`;

  test("a pure-function network resolves to its value", async () => {
    const result = await run.handle({ source: syncDsl, network: "d", cells: { n: "21" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cells["out"]).toBe(42);
  });
});
