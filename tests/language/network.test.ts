// defnetwork slice — the capstone: named leaves wired into runnable propagator graphs.
// The runtime adapter reuses the engine's `astToDataNetwork` + `NetworkRuntime` VERBATIM,
// building the runtime LAZILY on first invoke (so a network emitted before its leaf fns
// still resolves — the source-order tension). A network is registered as `network/<name>`
// and behaves as an async leaf returning an APromise, exactly like the engine's buildNetworks.
//
// `callLLMFn` is mocked (one test wires an llmfn leaf through a network); no live API call.

jest.mock("../../src/sandbox/llmfn-client.js", () => ({ callLLMFn: jest.fn() }));

import { callLLMFn } from "../../src/sandbox/llmfn-client.js";
import { emitJs, parseProgram } from "../../src/language/index.js";
import { parseProgram as oracleParse } from "../../src/data-network/tree-to-network.js";
import * as rt from "../../src/language/runtime/index.js";
import { APromise } from "../../src/information-structures/apromise.js";
import { Something } from "../../src/info-structure.js";
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

// Await a network leaf invocation (it returns an APromise) down to its InfoStructure.
async function settle(info: unknown): Promise<unknown> {
  return (info as APromise<unknown>).deferred.promise;
}

const ADD2 = `
defn add2
  signature: from [Number?(a), Number?(b)] to Number?;
  expression a + b;
end
`;

describe("defnetwork slice — parse + emit + runnable propagator graph", () => {
  test("parses to a network node equal to the Lezer oracle's (all four term kinds, as + with)", () => {
    const src = `
defnetwork pipeline
  signature: from [a, b] to out;
  cell scratch = 0;
  constant k = 'x';
  propagate add2 from [a, b] to scratch;
  propagate tag as mapping from [scratch] to out with: lang = 'en', n = '3';
  switch positive? from [a, out] to gated;
end
`;
    const node = parseProgram(src).nodes.find((n) => n.kind === "network");
    expect(node).toEqual(oracleParse(src).networks[0]);
  });

  test("end-to-end: a network propagating a user fn computes through the real engine", async () => {
    const reg = run(emitJs(`${ADD2}
defnetwork sum
  signature: from [a, b] to c;
  propagate add2 from [a, b] to c;
end
`));
    const out = reg.resolve("network/sum")(2, 3);
    expect(out).toBeInstanceOf(APromise);
    expect(await settle(out)).toEqual(new Something(5));
  });

  test("emit-order independence: a network defined BEFORE its leaf fn still resolves (lazy build)", async () => {
    const reg = run(emitJs(`
defnetwork sum2
  signature: from [a, b] to c;
  propagate add2 from [a, b] to c;
end
${ADD2}`));
    expect(await settle(reg.resolve("network/sum2")(4, 5))).toEqual(new Something(9));
  });

  test("network-as-leaf: a network may `propagate network/<other>` (composition)", async () => {
    const reg = run(emitJs(`${ADD2}
defnetwork inner
  signature: from [a, b] to c;
  propagate add2 from [a, b] to c;
end

defnetwork outer
  signature: from [x, y] to z;
  propagate network/inner from [x, y] to z;
end
`));
    expect(await settle(reg.resolve("network/outer")(6, 7))).toEqual(new Something(13));
  });

  test("switch term: `switch positive? …` gates the value cell through a predicate", async () => {
    const reg = run(emitJs(`
defpredicate positive?
  signature: from [Number?(n)] to Boolean?;
  expression n > 0;
end

defnetwork gate
  signature: from [t, v] to out;
  switch positive? from [t, v] to out;
end
`));
    expect(await settle(reg.resolve("network/gate")(5, 99))).toEqual(new Something(99));
  });

  test("async llmfn leaf flows through the graph (callLLMFn mocked)", async () => {
    mockCall.mockReturnValueOnce(Promise.resolve({ __type: "Analysis", label: "ok" }));
    const reg = run(emitJs(`
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
`));
    expect(await settle(reg.resolve("network/qa")("hello"))).toEqual(new Something({ __type: "Analysis", label: "ok" }));
  });
});
