import { APromise } from "../../src/information-structures/apromise.js";
import { Deferred, ABORTED } from "../../src/information-structures/deferred.js";
import { Nothing, Something, Contradiction } from "../../src/info-structure.js";

function makeAP<A>(value?: A): { ap: APromise<A>; d: Deferred<unknown> } {
  const d = new Deferred<unknown>();
  const ap = new APromise<A>(d);
  if (value !== undefined) d.resolve(value);
  return { ap, d };
}

describe("APromise: content", () => {
  test("returns undefined when not realized", () => {
    const { ap } = makeAP();
    expect(ap.content()).toBeUndefined();
  });

  test("returns resolved value when realized", () => {
    const { ap } = makeAP(42);
    expect(ap.content()).toBe(42);
  });
});

describe("APromise: equals", () => {
  test("equals itself", () => {
    const { ap } = makeAP();
    expect(ap.equals(ap)).toBe(true);
  });

  test("does not equal another APromise", () => {
    const { ap: ap1 } = makeAP();
    const { ap: ap2 } = makeAP();
    expect(ap1.equals(ap2)).toBe(false);
  });
});

describe("APromise: unpack", () => {
  test("chains function over resolved value", async () => {
    const { ap, d } = makeAP<number>();
    const result = ap.unpack(x => new Something((x as number) * 2));
    d.resolve(3);
    expect(await (result as APromise<unknown>).deferred.promise).toEqual(new Something(6));
  });
});

describe("APromise: merge", () => {
  test("APromise × APromise: merges both resolved values", async () => {
    const d1 = new Deferred<unknown>();
    const d2 = new Deferred<unknown>();
    const ap1 = new APromise(d1);
    const ap2 = new APromise(d2);
    const merged = ap1.merge(ap2) as APromise<unknown>;
    d1.resolve(new Something(1));
    d2.resolve(new Something(1));
    expect(await merged.deferred.promise).toEqual(new Something(1));
  });

  test("APromise × Something: merges when resolved", async () => {
    const { ap, d } = makeAP<unknown>();
    const merged = ap.merge(new Something(5)) as APromise<unknown>;
    d.resolve(new Something(5));
    expect(await merged.deferred.promise).toEqual(new Something(5));
  });

  test("Something × APromise: delegates to APromise.merge", async () => {
    const { ap, d } = makeAP<unknown>();
    const merged = new Something(5).merge(ap) as APromise<unknown>;
    d.resolve(new Something(5));
    expect(await merged.deferred.promise).toEqual(new Something(5));
  });

  test("Nothing × APromise: returns APromise", () => {
    const { ap } = makeAP();
    const result = Nothing.merge(ap);
    expect(result).toBe(ap);
  });
});

describe("APromise: flatten — already realized", () => {
  test("realized with Something flattens to Something", async () => {
    const d = new Deferred<unknown>();
    d.resolve(new Something(42));
    const ap = new APromise(d);
    const flat = ap.flatten() as APromise<unknown>;
    expect(await flat.deferred.promise).toEqual(new Something(42));
  });

  test("realized with nested APromise flattens through to inner value", async () => {
    const d_inner = new Deferred<unknown>();
    d_inner.resolve(new Something(42));
    const inner = new APromise(d_inner);

    const d_outer = new Deferred<unknown>();
    d_outer.resolve(inner);
    const outer = new APromise(d_outer);

    const flat = outer.flatten() as APromise<unknown>;
    expect(await flat.deferred.promise).toEqual(new Something(42));
  });

  test("realized with Nothing flattens to Nothing", async () => {
    const d = new Deferred<unknown>();
    d.resolve(Nothing);
    const ap = new APromise(d);
    const flat = ap.flatten() as APromise<unknown>;
    expect(await flat.deferred.promise).toBe(Nothing);
  });
});

describe("APromise: flatten — not yet realized", () => {
  test("resolves to Something after deferred resolves", async () => {
    const d = new Deferred<unknown>();
    const ap = new APromise(d);
    const flat = ap.flatten() as APromise<unknown>;
    d.resolve(new Something(7));
    expect(await flat.deferred.promise).toEqual(new Something(7));
  });

  test("resolves through nested APromise resolved after flatten call", async () => {
    const d_outer = new Deferred<unknown>();
    const outer = new APromise(d_outer);
    const flat = outer.flatten() as APromise<unknown>;

    const d_inner = new Deferred<unknown>();
    const inner = new APromise(d_inner);
    d_outer.resolve(inner);
    d_inner.resolve(new Something(99));

    expect(await flat.deferred.promise).toEqual(new Something(99));
  });

  test("deep nesting: three levels flatten to inner value", async () => {
    const d1 = new Deferred<unknown>();
    const d2 = new Deferred<unknown>();
    const d3 = new Deferred<unknown>();
    const ap1 = new APromise(d1);
    const ap2 = new APromise(d2);
    const ap3 = new APromise(d3);

    d1.resolve(ap2);
    d2.resolve(ap3);
    d3.resolve(new Something(123));

    const flat = ap1.flatten() as APromise<unknown>;
    expect(await flat.deferred.promise).toEqual(new Something(123));
  });
});

describe("APromise: abort", () => {
  test("abort resolves deferred with ABORTED contradiction", async () => {
    const { ap } = makeAP();
    ap.abort();
    expect(await ap.deferred.promise).toBe(ABORTED);
  });

  test("abort returns ABORTED contradiction", () => {
    const { ap } = makeAP();
    expect(ap.abort()).toBe(ABORTED);
  });

  test("abort sets AbortSignal to aborted", () => {
    const { ap } = makeAP();
    ap.abort();
    expect(ap.deferred.signal.aborted).toBe(true);
  });

  test("abort is a no-op if already realized", async () => {
    const { ap, d } = makeAP<unknown>();
    d.resolve(new Something(42));
    ap.abort();
    expect(await ap.deferred.promise).toEqual(new Something(42));
  });
});
