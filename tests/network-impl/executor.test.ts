import { Executor } from "../../src/network-impl/executor.js";

// The Executor caps how many async tasks run at once, parking the rest in a FIFO
// queue and starting each as a slot frees. It is domain-agnostic — it submits
// `() => Promise<T>` and returns `Promise<T>` — so it is tested here with plain
// controllable promises, no DSL involved.

// A promise whose resolution we drive by hand, so concurrency is observed
// deterministically instead of via timers.
function gate<T = void>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("Executor (bounded concurrency)", () => {
  // ── Capabilities ──────────────────────────────────────────────────────────────
  test("submit runs the thunk and resolves with its value", async () => {
    const ex = new Executor(2);
    expect(await ex.submit(async () => 42)).toBe(42);
  });

  test("all submitted tasks complete", async () => {
    const ex = new Executor(2);
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => ex.submit(async () => n * 10)));
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  // ── Invariant: the cap is never exceeded ────────────────────────────────────────
  test("never runs more than `cap` tasks at once", async () => {
    const ex = new Executor(2);
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, () => gate());
    const results = gates.map((g, i) =>
      ex.submit(async () => {
        active++;
        peak = Math.max(peak, active);
        await g.promise;
        active--;
        return i;
      }),
    );

    // Thunks run synchronously up to their first await, so right after submit the
    // first two are in flight and the rest are parked.
    expect(ex.inFlight).toBe(2);
    expect(ex.pending).toBe(3);

    gates.forEach((g) => g.resolve());
    expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
    expect(ex.peakInFlight).toBe(2);
  });

  test("with cap >= task count, every task runs concurrently", async () => {
    const ex = new Executor(10);
    const gates = Array.from({ length: 3 }, () => gate());
    const ps = gates.map((g) => ex.submit(async () => { await g.promise; }));
    expect(ex.inFlight).toBe(3);
    expect(ex.pending).toBe(0);
    gates.forEach((g) => g.resolve());
    await Promise.all(ps);
    expect(ex.peakInFlight).toBe(3);
  });

  // ── Invariant: FIFO scheduling ──────────────────────────────────────────────────
  test("parked tasks start in submission order", async () => {
    const ex = new Executor(1);
    const order: number[] = [];
    const ps = [0, 1, 2, 3].map((i) => ex.submit(async () => { order.push(i); }));
    await Promise.all(ps);
    expect(order).toEqual([0, 1, 2, 3]);
  });

  // ── A freed slot pulls the next task ────────────────────────────────────────────
  test("a rejecting thunk rejects its handle and frees its slot for the next task", async () => {
    const ex = new Executor(1);
    const a = ex.submit(async () => { throw new Error("boom"); });
    const b = ex.submit(async () => 42);
    await expect(a).rejects.toThrow("boom");
    expect(await b).toBe(42);
  });

  test("a synchronously-throwing thunk becomes a rejection, not an escaped throw", async () => {
    const ex = new Executor(1);
    const a = ex.submit((() => { throw new Error("sync"); }) as () => Promise<unknown>);
    const b = ex.submit(async () => "ok");
    await expect(a).rejects.toThrow("sync");
    expect(await b).toBe("ok");
  });

  // ── setCap ──────────────────────────────────────────────────────────────────────
  test("raising the cap immediately pumps parked tasks into the new slots", async () => {
    const ex = new Executor(1);
    const gates = Array.from({ length: 4 }, () => gate());
    const ps = gates.map((g) => ex.submit(async () => { await g.promise; }));
    expect(ex.inFlight).toBe(1);

    ex.setCap(3);
    expect(ex.inFlight).toBe(3);
    expect(ex.pending).toBe(1);

    gates.forEach((g) => g.resolve());
    await Promise.all(ps);
    expect(ex.peakInFlight).toBe(3);
  });

  // ── Negative ──────────────────────────────────────────────────────────────────
  test("a non-positive or non-integer cap is rejected", () => {
    expect(() => new Executor(0)).toThrow(/positive integer/);
    expect(() => new Executor(-1)).toThrow(/positive integer/);
    expect(() => new Executor(1.5)).toThrow(/positive integer/);
    expect(() => new Executor(2).setCap(0)).toThrow(/positive integer/);
  });
});
