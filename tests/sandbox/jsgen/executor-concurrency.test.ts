import { compile } from "../../../src/sandbox/jsgen/index.js";
import { Something } from "../../../src/info-structure.js";
import { APromise } from "../../../src/information-structures/apromise.js";
import { callLLMFn } from "../../../src/sandbox/llmfn-client.js";
import { defaultExecutor } from "../../../src/network-impl/executor.js";

// The registry submits every leaf model call through the shared `defaultExecutor`,
// so a wide `as mapping` fan-out is *scheduled* under the concurrency cap rather
// than firing all at once. This verifies the cap is honored end-to-end through a
// real network, and that the gathered result is still complete and in order.

jest.mock("../../../src/sandbox/llmfn-client.js", () => ({ callLLMFn: jest.fn() }));
const mockCallLLMFn = callLLMFn as jest.MockedFunction<typeof callLLMFn>;

const src = `
defrecord Analysis
  label: String?;
end

defllmfn classify
  signature: from [String?(text)] to Analysis?;
  """
  Classify: {{text}}
  """;
end

defnetwork classifyAll
  signature: from [docs] to results;
  propagate classify as mapping from [docs] to results;
end
`;

describe("executor caps leaf fan-out through a real network", () => {
  beforeEach(() => mockCallLLMFn.mockReset());

  test("at most `cap` model calls are in flight at once, yet all results gather in order", async () => {
    defaultExecutor.setCap(2);

    let active = 0;
    let peak = 0;
    mockCallLLMFn.mockImplementation(async (_prompt, named) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { __type: "Analysis", label: `${(named as { text: string }).text}-done` };
    });

    const { networks } = compile(src);
    const docs = ["a", "b", "c", "d", "e"];
    const result = networks.get("classifyAll")!.invoke({ docs });

    // The five calls are scheduled eagerly, but only two run before any await.
    expect(defaultExecutor.inFlight).toBe(2);
    expect(defaultExecutor.pending).toBe(3);

    const ap = result.cells.get("results")!.knows() as APromise<unknown>;
    const resolved = (await ap.deferred.promise) as Something<unknown>;

    expect(peak).toBe(2);
    expect((resolved.content() as { label: string }[]).map((a) => a.label)).toEqual([
      "a-done",
      "b-done",
      "c-done",
      "d-done",
      "e-done",
    ]);
  });
});
