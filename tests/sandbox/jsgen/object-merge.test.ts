import { compile } from "../../../src/sandbox/jsgen/index.js";
import { Something, Contradiction } from "../../../src/info-structure.js";
import { MergeObject } from "../../../src/information-structures/merge-object.js";

// `propagate <fn> as MergeObject ...` coerces a propagator's Something result
// into a MergeObject, so two propagators writing the same cell field-merge
// instead of colliding. It is the only DSL surface that yields a MergeObject;
// nary-unpacking is untouched — coercion wraps its output.

const src = `
defrecord Stats
  count: Number?;
  total: Number?;
end

defn countOf
  signature: from [Number?(n)] to Stats?;
  expression Stats(n, null);
end

defn totalOf
  signature: from [Number?(m)] to Stats?;
  expression Stats(null, m);
end

defn average
  signature: from [Stats?(s)] to Number?;
  expression s.total / s.count;
end

defnetwork stats
  signature: from [a, b] to avg;
  propagate countOf as MergeObject from [a] to combined;
  propagate totalOf as MergeObject from [b] to combined;
  propagate average from [combined] to avg;
end
`;

describe("propagate ... as MergeObject", () => {
  const net = compile(src).networks.get("stats")!;

  // ── Capabilities ────────────────────────────────────────────────────────────
  test("two propagators field-merge into one MergeObject cell", () => {
    const combined = net.invoke({ a: 10, b: 200 }).cells.get("combined")!.knows();
    expect(combined).toBeInstanceOf(MergeObject);
    expect((combined as MergeObject).content()).toEqual({ __type: "Stats", count: 10, total: 200 });
  });

  test("a single writer still yields a MergeObject", () => {
    expect(net.invoke({ a: 10 }).cells.get("combined")!.knows()).toBeInstanceOf(MergeObject);
  });

  test("a downstream propagator computes from the merged record", () => {
    const r = net.invoke({ a: 10, b: 200 });
    expect(r.type).toBe("done");
    expect(r.cells.get("avg")!.knows()).toEqual(new Something(20));
  });

  // ── Negative ──────────────────────────────────────────────────────────────────
  test("without the coercion, the same two writers collide into a Contradiction", () => {
    const baseline = compile(src.replace(/ as MergeObject/g, "")).networks.get("stats")!;
    const r = baseline.invoke({ a: 10, b: 200 });
    expect(r.type).toBe("exit");
    expect(r.cells.get("combined")!.knows()).toBeInstanceOf(Contradiction);
  });
});

// ── Negative: coercion guards ───────────────────────────────────────────────────

test("as MergeObject on a non-object result produces a Contradiction", () => {
  const scalarSrc = `
defn pick
  signature: from [Number?(n)] to Number?;
  expression n;
end

defnetwork scalar
  signature: from [a] to out;
  propagate pick as MergeObject from [a] to out;
end
`;
  const net = compile(scalarSrc).networks.get("scalar")!;
  expect(net.invoke({ a: 5 }).cells.get("out")!.knows()).toBeInstanceOf(Contradiction);
});

test("an unsupported coercion target is rejected at compile time", () => {
  const bad = src.replace(/as MergeObject/g, "as Frobnicate");
  expect(() => compile(bad)).toThrow(/MergeObject/);
});
