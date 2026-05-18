import { Deferred } from "../../src/information-structures/deferred.js";

describe("Deferred: initial state", () => {
  test("is not realized initially", () => {
    const d = new Deferred();
    expect(d.isRealized).toBe(false);
  });

  test("resolvedValue is undefined initially", () => {
    const d = new Deferred();
    expect(d.resolvedValue).toBeUndefined();
  });
});

describe("Deferred: resolve", () => {
  test("becomes realized after resolve", () => {
    const d = new Deferred<number>();
    d.resolve(42);
    expect(d.isRealized).toBe(true);
  });

  test("resolvedValue reflects the resolved value", () => {
    const d = new Deferred<number>();
    d.resolve(42);
    expect(d.resolvedValue).toBe(42);
  });

  test("promise resolves to the given value", async () => {
    const d = new Deferred<number>();
    d.resolve(42);
    expect(await d.promise).toBe(42);
  });

  test("resolve is a no-op if already realized", () => {
    const d = new Deferred<number>();
    d.resolve(1);
    d.resolve(2);
    expect(d.resolvedValue).toBe(1);
  });

  test("promise still resolves to first value after second resolve attempt", async () => {
    const d = new Deferred<number>();
    d.resolve(1);
    d.resolve(2);
    expect(await d.promise).toBe(1);
  });
});
