import { compile } from "../../../src/sandbox/jsgen/index.js";
import { Contradiction } from "../../../src/info-structure.js";
import { MergeSet } from "../../../src/information-structures/merge-set.js";

// `propagate <fn> as MergeSet ...` coerces a propagator's array result into a
// MergeSet, whose merge is set intersection. Two propagators writing the same cell
// narrow the domain; a downstream propagator maps elementwise over the surviving
// set (the sequence monad). Coercion wraps nary-unpacking's output — it is untouched.

const asSet = (x: unknown) => new Set(x as unknown[]);

const src = `
defn keep
  signature: from [Number?(x)] to Number?;
  expression x;
end

defn dbl
  signature: from [Number?(n)] to Number?;
  expression n * 2;
end

defn add
  signature: from [Number?(x), Number?(y)] to Number?;
  expression x + y;
end

defnetwork narrow
  signature: from [a, b] to out;
  propagate keep as MergeSet from [a] to combined;
  propagate keep as MergeSet from [b] to combined;
  propagate dbl from [combined] to out;
end

defnetwork product
  signature: from [a, b] to out;
  propagate keep as MergeSet from [a] to sa;
  propagate keep as MergeSet from [b] to sb;
  propagate add from [sa, sb] to out;
end

defnetwork scalar
  signature: from [a] to out;
  propagate keep as MergeSet from [a] to out;
end
`;

const program = compile(src);
const narrow = program.networks.get("narrow")!;
const product = program.networks.get("product")!;
const scalar = program.networks.get("scalar")!;

describe("propagate ... as MergeSet", () => {
  // ── Capabilities ────────────────────────────────────────────────────────────
  test("two propagators intersect into one MergeSet cell", () => {
    const combined = narrow.invoke({ a: [1, 2, 3], b: [2, 3, 4] }).cells.get("combined")!.knows();
    expect(combined).toBeInstanceOf(MergeSet);
    expect(asSet((combined as MergeSet).content())).toEqual(new Set([2, 3]));
  });

  test("a single writer still yields a MergeSet", () => {
    const combined = narrow.invoke({ a: [1, 2, 3] }).cells.get("combined")!.knows();
    expect(combined).toBeInstanceOf(MergeSet);
    expect(asSet((combined as MergeSet).content())).toEqual(new Set([1, 2, 3]));
  });

  test("a downstream propagator maps elementwise over the merged set", () => {
    const r = narrow.invoke({ a: [1, 2, 3], b: [2, 3, 4] });
    expect(r.type).toBe("done");
    const out = r.cells.get("out")!.knows();
    expect(out).toBeInstanceOf(MergeSet);
    expect(asSet((out as MergeSet).content())).toEqual(new Set([4, 6]));
  });

  test("an n-ary propagator over two MergeSets yields the Cartesian product", () => {
    const out = product.invoke({ a: [1, 2], b: [10, 20] }).cells.get("out")!.knows();
    expect(out).toBeInstanceOf(MergeSet);
    expect(asSet((out as MergeSet).content())).toEqual(new Set([11, 21, 12, 22]));
  });

  // ── Negative ──────────────────────────────────────────────────────────────────
  test("an empty intersection collapses the cell into a Contradiction", () => {
    const r = narrow.invoke({ a: [1], b: [2] });
    expect(r.type).toBe("exit");
    expect(r.cells.get("combined")!.knows()).toBeInstanceOf(Contradiction);
  });

  test("as MergeSet on a non-array result produces a Contradiction", () => {
    expect(scalar.invoke({ a: 5 }).cells.get("out")!.knows()).toBeInstanceOf(Contradiction);
  });

  test("as MergeSet on an empty array is a Contradiction (empty domain)", () => {
    expect(scalar.invoke({ a: [] }).cells.get("out")!.knows()).toBeInstanceOf(Contradiction);
  });

  // An inherited Object.prototype key must not be mistaken for a registered coercion.
  test("a coercion named after a prototype key is rejected, not silently accepted", () => {
    const bad = src.replace("as MergeSet", "as toString");
    expect(() => compile(bad)).toThrow(/unsupported coercion/);
  });
});
