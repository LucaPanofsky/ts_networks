import { compile } from "../../../src/sandbox/jsgen/index.js";
import { Something, Contradiction, Nothing } from "../../../src/info-structure.js";
import { APromise } from "../../../src/information-structures/apromise.js";
import { callLLMFn } from "../../../src/sandbox/llmfn-client.js";

// `propagate <fn> as mapping from [xs] to ys` coerces the fn's *application*: the
// input cell holds a vector and the fn is mapped over its elements, gathering the
// results back into a Something(vector). `as filtering` does the same with a
// predicate, keeping the elements whose result is truthy. Single input only.

jest.mock("../../../src/sandbox/llmfn-client.js", () => ({ callLLMFn: jest.fn() }));
const mockCallLLMFn = callLLMFn as jest.MockedFunction<typeof callLLMFn>;

const asSet = (x: unknown) => new Set(x as unknown[]);

const src = `
defn dbl
  signature: from [Number?(n)] to Number?;
  expression n * 2;
end

defpredicate big?
  signature: from [Number?(n)] to Boolean?;
  expression n > 2;
end

defrecord Box
  v: Number?;
end

defn pickPositive
  signature: from [Box?(b)] to Number?;
  expression
    match b
      | Box { v: x } when x > 0 -> x
    end;
end

defnetwork mapped
  signature: from [xs] to ys;
  propagate dbl as mapping from [xs] to ys;
end

defnetwork filtered
  signature: from [xs] to ys;
  propagate big? as filtering from [xs] to ys;
end

defnetwork mappedMaybe
  signature: from [bs] to ys;
  propagate pickPositive as mapping from [bs] to ys;
end
`;

const program = compile(src);
const mapped = program.networks.get("mapped")!;
const filtered = program.networks.get("filtered")!;
const mappedMaybe = program.networks.get("mappedMaybe")!;

describe("propagate ... as mapping / as filtering (sync)", () => {
  // ── Capabilities ────────────────────────────────────────────────────────────
  test("mapping applies the fn elementwise over the vector", () => {
    const ys = mapped.invoke({ xs: [1, 2, 3] }).cells.get("ys")!.knows();
    expect(ys).toBeInstanceOf(Something);
    expect((ys as Something<unknown>).content()).toEqual([2, 4, 6]);
  });

  test("mapping preserves order and duplicates (it is a vector, not a set)", () => {
    const ys = mapped.invoke({ xs: [3, 1, 1] }).cells.get("ys")!.knows();
    expect((ys as Something<unknown>).content()).toEqual([6, 2, 2]);
  });

  test("filtering keeps the elements whose predicate is truthy, in order", () => {
    const ys = filtered.invoke({ xs: [1, 2, 3, 4] }).cells.get("ys")!.knows();
    expect(ys).toBeInstanceOf(Something);
    expect((ys as Something<unknown>).content()).toEqual([3, 4]);
  });

  // ── Empty vector ──────────────────────────────────────────────────────────────
  test("mapping over an empty vector is an empty vector (not a Contradiction)", () => {
    const ys = mapped.invoke({ xs: [] }).cells.get("ys")!.knows();
    expect(ys).toBeInstanceOf(Something);
    expect((ys as Something<unknown>).content()).toEqual([]);
  });

  test("filtering over an empty vector is an empty vector", () => {
    const ys = filtered.invoke({ xs: [] }).cells.get("ys")!.knows();
    expect((ys as Something<unknown>).content()).toEqual([]);
  });

  // ── Negative ──────────────────────────────────────────────────────────────────
  test("mapping over a non-array input is a Contradiction", () => {
    const r = mapped.invoke({ xs: 5 });
    expect(r.type).toBe("exit");
    expect(r.cells.get("ys")!.knows()).toBeInstanceOf(Contradiction);
  });

  test("filtering over a non-array input is a Contradiction", () => {
    expect(filtered.invoke({ xs: 5 }).cells.get("ys")!.knows()).toBeInstanceOf(Contradiction);
  });

  test("mapping with more than one input is rejected at compile time, not silently dropped", () => {
    const twoInput = `
      defn add
        signature: from [Number?(x), Number?(y)] to Number?;
        expression x + y;
      end
      defnetwork bad
        signature: from [xs, ys] to zs;
        propagate add as mapping from [xs, ys] to zs;
      end
    `;
    expect(() => compile(twoInput)).toThrow(/single vector input/);
  });

  // ── Element-level collapse (invariants) ─────────────────────────────────────────
  test("an element yielding Nothing makes the whole mapping Nothing (wait)", () => {
    // pickPositive falls through to undefined (→ Nothing) for v <= 0.
    const r = mappedMaybe.invoke({ bs: [{ __type: "Box", v: 1 }, { __type: "Box", v: -1 }] });
    expect(r.type).toBe("done");
    expect(r.cells.get("ys")!.knows()).toBe(Nothing);
  });

  test("when no element drops out, mapping over the same shape yields the vector", () => {
    const ys = mappedMaybe
      .invoke({ bs: [{ __type: "Box", v: 1 }, { __type: "Box", v: 2 }] })
      .cells.get("ys")!.knows();
    expect((ys as Something<unknown>).content()).toEqual([1, 2]);
  });
});

const asyncSrc = `
defrecord Analysis
  label: String?;
end

defllmfn classify
  signature: from [String?(text)] to Analysis?;
  with: model = 'claude-opus-4-7';
  """
  Classify: {{text}}
  """;
end

defnetwork classifyAll
  signature: from [docs] to results;
  propagate classify as mapping from [docs] to results;
end
`;

describe("propagate ... as mapping (async): parallel fan-out", () => {
  beforeEach(() => mockCallLLMFn.mockReset());

  test("every element fires eagerly — calls dispatch in parallel, not sequentially", () => {
    mockCallLLMFn.mockImplementation((_p, named) =>
      Promise.resolve({ __type: "Analysis", label: `${(named as { text: string }).text}-done` }),
    );
    const { networks } = compile(asyncSrc);
    const result = networks.get("classifyAll")!.invoke({ docs: ["a", "b", "c"] });
    // All three calls were issued synchronously during invoke, before any awaiting.
    expect(mockCallLLMFn).toHaveBeenCalledTimes(3);
    expect(result.cells.get("results")!.knows()).toBeInstanceOf(APromise);
  });

  test("the gathered result is a Something(vector) of the per-element results, in order", async () => {
    mockCallLLMFn.mockImplementation((_p, named) =>
      Promise.resolve({ __type: "Analysis", label: `${(named as { text: string }).text}-done` }),
    );
    const { networks } = compile(asyncSrc);
    const result = networks.get("classifyAll")!.invoke({ docs: ["a", "b", "c"] });
    const ap = result.cells.get("results")!.knows() as APromise<unknown>;
    const resolved = (await ap.deferred.promise) as Something<unknown>;
    expect((resolved.content() as { label: string }[]).map(a => a.label)).toEqual([
      "a-done",
      "b-done",
      "c-done",
    ]);
  });

  test("an element resolving to a Contradiction collapses the whole mapping", async () => {
    mockCallLLMFn
      .mockResolvedValueOnce({ __type: "Analysis", label: "a-done" })
      .mockRejectedValueOnce(new Error("model failure"))
      .mockResolvedValueOnce({ __type: "Analysis", label: "c-done" });
    const { networks } = compile(asyncSrc);
    const result = networks.get("classifyAll")!.invoke({ docs: ["a", "b", "c"] });
    const ap = result.cells.get("results")!.knows() as APromise<unknown>;
    const resolved = await ap.deferred.promise;
    expect(resolved).toBeInstanceOf(Contradiction);
  });
});
