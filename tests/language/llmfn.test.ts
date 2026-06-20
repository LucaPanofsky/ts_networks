// defllmfn slice — the async, LLM-backed leaf. It is NOT source-emitted; the runtime
// `rt.llmFn` replicates the engine's `buildRegistry` closure (memoized APromise over the
// bounded executor) reusing `callLLMFn`/`deriveProtocol`/`toolsFromConfig` verbatim.
//
// `callLLMFn` is MOCKED (no live API call), exactly as the engine test
// (tests/sandbox/jsgen/llmfn.test.ts) does — so the leaf is exercised end to end (parse →
// emit → register → invoke → await the APromise) without touching the network.

jest.mock("../../src/sandbox/llmfn-client.js", () => ({ callLLMFn: jest.fn() }));

import { callLLMFn } from "../../src/sandbox/llmfn-client.js";
import { emitJs, parseProgram } from "../../src/language/index.js";
import { parseProgramLezer as oracleParse } from "../../src/data-network/tree-to-network.js";
import * as rt from "../../src/language/runtime/index.js";
import { APromise } from "../../src/information-structures/apromise.js";
import { Something, Contradiction } from "../../src/info-structure.js";
import type { Registry } from "../../src/language/core/runtime-api.js";

const mockCall = callLLMFn as jest.MockedFunction<typeof callLLMFn>;

function run(js: string): Registry {
  const body =
    js
      .split("\n")
      .filter((l) => !/^\s*import\s/.test(l) && !/^\s*export\s/.test(l))
      .join("\n") + "\nreturn __reg;";
  return new Function("rt", body)(rt) as Registry;
}

const src = `
defrecord DocumentAnalysis
  type: String?;
  sentiment: String?;
  summary: String?;
  confidence: Number?;
end

defllmfn analyzeDocument
  signature: from [String?(text)] to DocumentAnalysis?;
  with: model = 'claude-opus-4-7';
  user """
  Analyze: {{text}}
  """;
end
`;

function fakeAnalysis(): Record<string, unknown> {
  return { __type: "DocumentAnalysis", type: "report", sentiment: "neutral", summary: "A doc.", confidence: 0.6 };
}

beforeEach(() => mockCall.mockReset());

describe("defllmfn slice — parse + emit + the memoized async leaf", () => {
  test("parses to an llmfn node equal to the Lezer oracle's (signature, with:, prompt)", () => {
    const node = parseProgram(src).nodes.find((n) => n.kind === "llmfn");
    expect(node).toEqual(oracleParse(src).llmFns[0]);
  });

  test("a multi-pair `with:` with an underscore key parses like the oracle (regression)", () => {
    // `max_tokens` exercises `_` in a config key (identChar) and comma-separated pairs —
    // the form the original slice fixture (single `model = …`) didn't cover.
    const multi = `
defllmfn classify
  signature: from [String?(text)] to String?;
  with: model = 'claude-opus-4-7', max_tokens = '4096';
  user """Classify {{text}}""";
end
`;
    const node = parseProgram(multi).nodes.find((n) => n.kind === "llmfn");
    expect(node).toEqual(oracleParse(multi).llmFns[0]);
    expect((node as { config: Record<string, string> }).config).toEqual({
      model: "claude-opus-4-7",
      max_tokens: "4096",
    });
  });

  test("a system clause + a bare-prompt shorthand parse like the oracle (system stable, bare → user)", () => {
    const withSystem = `
defrecord R
  v: String?;
end

defllmfn ask
  signature: from [String?(q)] to R?;
  system """You are terse.""";
  """Answer: {{q}}""";
end
`;
    const node = parseProgram(withSystem).nodes.find((n) => n.kind === "llmfn");
    expect(node).toEqual(oracleParse(withSystem).llmFns[0]);
    // the bare block populated `user`, the labelled block populated `system`.
    expect((node as { user: string }).user).toBe("Answer: {{q}}");
    expect((node as { system?: string }).system).toBe("You are terse.");
  });

  test("registers an async leaf: invoking returns an unrealized APromise synchronously", () => {
    mockCall.mockReturnValueOnce(Promise.resolve(fakeAnalysis()));
    const reg = run(emitJs(src));
    const ap = reg.resolve("analyzeDocument")("some text");
    expect(ap).toBeInstanceOf(APromise);
    expect((ap as APromise<unknown>).deferred.isRealized).toBe(false);
  });

  test("the leaf resolves to Something(result), rendering the user prompt with the args", async () => {
    mockCall.mockReturnValueOnce(Promise.resolve(fakeAnalysis()));
    const reg = run(emitJs(src));
    const ap = reg.resolve("analyzeDocument")("some text") as APromise<unknown>;
    const resolved = await ap.deferred.promise;
    expect(resolved).toBeInstanceOf(Something);
    expect((resolved as Something<unknown>).content()).toEqual(fakeAnalysis());
    // wiring: the user template + named args + config(model from `with:`) reached callLLMFn.
    const [template, args, , config] = mockCall.mock.calls[0]!;
    expect(template).toContain("Analyze: {{text}}");
    expect(args).toEqual({ text: "some text" });
    expect((config as { model?: string }).model).toBe("claude-opus-4-7");
  });

  test("memoized: identical args share ONE in-flight APromise and one model call (re-fire is a no-op)", () => {
    mockCall.mockReturnValue(Promise.resolve(fakeAnalysis()));
    const reg = run(emitJs(src));
    const leaf = reg.resolve("analyzeDocument");
    const a = leaf("some text");
    const b = leaf("some text");
    expect(a).toBe(b); // same reference — re-merging the result cannot self-contradict
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  test("a failed model call resolves the leaf to a Contradiction, not a Something", async () => {
    mockCall.mockReturnValueOnce(Promise.reject(new Error("boom")));
    const reg = run(emitJs(src));
    const ap = reg.resolve("analyzeDocument")("some text") as APromise<unknown>;
    const resolved = await ap.deferred.promise;
    expect(resolved).toBeInstanceOf(Contradiction);
  });
});
