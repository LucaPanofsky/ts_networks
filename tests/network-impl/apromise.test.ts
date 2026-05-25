import { APromise } from "../../src/information-structures/apromise.js";
import { Deferred, ABORTED } from "../../src/information-structures/deferred.js";
import { Nothing, Something } from "../../src/info-structure.js";

function makeAP<A>(value?: A): { ap: APromise<A>; d: Deferred<unknown> } {
  const d = new Deferred<unknown>();
  const ap = new APromise<A>(d);
  if (value !== undefined) d.resolve(value);
  return { ap, d };
}

// ── Capabilities ──────────────────────────────────────────────────────────────

describe("APromise: content", () => {
  test("returns undefined when pending, resolved value when realized", () => {
    const { ap: pending } = makeAP();
    expect(pending.content()).toBeUndefined();
    const { ap: resolved } = makeAP(42);
    expect(resolved.content()).toBe(42);
  });
});

describe("APromise: equals", () => {
  test("equals itself but not another APromise", () => {
    const { ap: ap1 } = makeAP();
    const { ap: ap2 } = makeAP();
    expect(ap1.equals(ap1)).toBe(true);
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

  // ── Invariants ──────────────────────────────────────────────────────────────
  test("merge is commutative: Something × APromise delegates to APromise.merge", async () => {
    const { ap, d } = makeAP<unknown>();
    const merged = new Something(5).merge(ap) as APromise<unknown>;
    d.resolve(new Something(5));
    expect(await merged.deferred.promise).toEqual(new Something(5));
  });

  test("Nothing × APromise: pending computation wins over no information", () => {
    const { ap } = makeAP();
    expect(Nothing.merge(ap)).toBe(ap);
  });

  test("APromise × Nothing: Nothing wins when pending; resolved value wins when realized", () => {
    const { ap: pending } = makeAP();
    expect(pending.merge(Nothing)).toBe(Nothing);

    const { ap: realized, d } = makeAP<unknown>();
    d.resolve(new Something(42));
    expect(realized.merge(Nothing)).toEqual(new Something(42));
  });
});

describe("APromise: flatten", () => {
  test("already realized: Something passes through; Nothing passes through", async () => {
    const dSomething = new Deferred<unknown>();
    dSomething.resolve(new Something(42));
    const flat = new APromise(dSomething).flatten() as APromise<unknown>;
    expect(await flat.deferred.promise).toEqual(new Something(42));

    const dNothing = new Deferred<unknown>();
    dNothing.resolve(Nothing);
    const flatNothing = new APromise(dNothing).flatten() as APromise<unknown>;
    expect(await flatNothing.deferred.promise).toBe(Nothing);
  });

  test("already realized: nested APromise flattens through to inner value", async () => {
    const d_inner = new Deferred<unknown>();
    d_inner.resolve(new Something(42));
    const inner = new APromise(d_inner);
    const d_outer = new Deferred<unknown>();
    d_outer.resolve(inner);
    const flat = new APromise(d_outer).flatten() as APromise<unknown>;
    expect(await flat.deferred.promise).toEqual(new Something(42));
  });

  test("not yet realized: resolves to Something after deferred resolves", async () => {
    const d = new Deferred<unknown>();
    const flat = new APromise(d).flatten() as APromise<unknown>;
    d.resolve(new Something(7));
    expect(await flat.deferred.promise).toEqual(new Something(7));
  });

  test("not yet realized: resolves through nested APromise created after flatten call", async () => {
    const d_outer = new Deferred<unknown>();
    const flat = new APromise(d_outer).flatten() as APromise<unknown>;
    const d_inner = new Deferred<unknown>();
    const inner = new APromise(d_inner);
    d_outer.resolve(inner);
    d_inner.resolve(new Something(99));
    expect(await flat.deferred.promise).toEqual(new Something(99));
  });
});

describe("APromise: abort", () => {
  test("abort resolves deferred with ABORTED and returns ABORTED", async () => {
    const { ap } = makeAP();
    const returned = ap.abort();
    expect(returned).toBe(ABORTED);
    expect(await ap.deferred.promise).toBe(ABORTED);
  });

  test("abort sets AbortSignal to aborted", () => {
    const { ap } = makeAP();
    ap.abort();
    expect(ap.deferred.signal.aborted).toBe(true);
  });

  // ── Invariants ──────────────────────────────────────────────────────────────
  test("abort is a no-op if already realized", async () => {
    const { ap, d } = makeAP<unknown>();
    d.resolve(new Something(42));
    ap.abort();
    expect(await ap.deferred.promise).toEqual(new Something(42));
  });
});
