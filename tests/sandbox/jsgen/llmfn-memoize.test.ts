import { compile } from "../../../src/sandbox/jsgen/index.js";
import { APromise } from "../../../src/information-structures/apromise.js";
import { callLLMFn } from "../../../src/sandbox/llmfn-client.js";

// An `llmfn` leaf is impure (a nondeterministic, billed API call), but the propagation
// model treats every propagator as a pure function of its inputs — so a propagator may
// fire more than once over the same inputs (the async runner does no coalescing). To
// keep that harmless, each `llmfn` impl is MEMOIZED on its inputs for the lifetime of the
// compiled program (per-run, since the `run` op compiles per invocation): a re-fire with
// equal inputs returns the SAME in-flight APromise instead of making a second call.

jest.mock("../../../src/sandbox/llmfn-client.js", () => ({ callLLMFn: jest.fn() }));
const mockCallLLMFn = callLLMFn as jest.MockedFunction<typeof callLLMFn>;

const SCALAR_DSL = `
defllmfn ana
  signature: from [String?(text)] to String?;
  """Analyze: {{text}}""";
end
`;

const RECORD_DSL = `
defrecord Doc
  x: Number?;
end
defllmfn ana
  signature: from [Doc?(d)] to String?;
  """Analyze: {{d}}""";
end
`;

const implOf = (dsl: string) => compile(dsl).registry.get("ana")!.impl;
const settle = (...aps: unknown[]) =>
  Promise.all(aps.map(ap => (ap as APromise<unknown>).deferred.promise));

beforeEach(() => {
  mockCallLLMFn.mockReset();
  mockCallLLMFn.mockResolvedValue("result");
});

describe("llmfn memoization (per compiled program)", () => {
  test("equal inputs reuse one call and return the same APromise", async () => {
    const impl = implOf(SCALAR_DSL);
    const a1 = impl("same doc");
    const a2 = impl("same doc");

    expect(a1).toBe(a2); // shared in-band, even before resolution
    await settle(a1);
    expect(mockCallLLMFn).toHaveBeenCalledTimes(1);
  });

  test("different inputs make separate calls and distinct APromises", async () => {
    const impl = implOf(SCALAR_DSL);
    const a1 = impl("doc A");
    const a2 = impl("doc B");

    expect(a1).not.toBe(a2);
    await settle(a1, a2);
    expect(mockCallLLMFn).toHaveBeenCalledTimes(2);
  });

  test("structurally-equal record inputs (distinct objects) hit one cache entry", async () => {
    const impl = implOf(RECORD_DSL);
    const a1 = impl({ __type: "Doc", x: 1 });
    const a2 = impl({ __type: "Doc", x: 1 }); // equal by value, different reference

    expect(a1).toBe(a2);
    await settle(a1);
    expect(mockCallLLMFn).toHaveBeenCalledTimes(1);
  });

  test("key is order-insensitive over record fields", async () => {
    const impl = implOf(RECORD_DSL);
    const a1 = impl({ __type: "Doc", x: 1 });
    const a2 = impl({ x: 1, __type: "Doc" }); // same fields, different key order
    expect(a1).toBe(a2);
    await settle(a1);
    expect(mockCallLLMFn).toHaveBeenCalledTimes(1);
  });

  test("a failure (rejected call) is cached too, so a re-fire does not re-call", async () => {
    mockCallLLMFn.mockReset();
    mockCallLLMFn.mockRejectedValue(new Error("api boom"));
    const impl = implOf(SCALAR_DSL);
    const a1 = impl("doc");
    const a2 = impl("doc");

    expect(a1).toBe(a2);
    await settle(a1); // resolves to a Contradiction, not a rejection
    expect(mockCallLLMFn).toHaveBeenCalledTimes(1);
  });

  test("the cache is per compiled program: a fresh compile re-queries", async () => {
    const a = implOf(SCALAR_DSL)("doc");
    const b = implOf(SCALAR_DSL)("doc"); // separate compile → separate cache

    expect(a).not.toBe(b);
    await settle(a, b);
    expect(mockCallLLMFn).toHaveBeenCalledTimes(2);
  });
});
