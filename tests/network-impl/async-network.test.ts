import { run } from "../../src/network-impl/runner.js";
import { Cell } from "../../src/network-impl/cell.js";
import { Propagator } from "../../src/network-impl/propagator.js";
import { APromise } from "../../src/information-structures/apromise.js";
import { Deferred } from "../../src/information-structures/deferred.js";
import { Something } from "../../src/info-structure.js";
import { naryUnpacking } from "../../src/nary-unpacking.js";

function delayedValue(v: unknown, ms: number): APromise<unknown> {
  const d = new Deferred<unknown>();
  setTimeout(() => d.resolve(new Something(v)), ms);
  return new APromise(d);
}

const asyncDouble = naryUnpacking((x: unknown) => delayedValue((x as number) * 2, 50), 1);

// ── Capabilities ──────────────────────────────────────────────────────────────

describe("async network: propagator returning APromise", () => {
  test("output is an unrealized APromise immediately, resolved value available after promise settles", async () => {
    const cells = new Map([
      ["input", new Cell("input")],
      ["output", new Cell("output")],
    ]);
    const p = new Propagator("asyncDouble", ["input"], "output", asyncDouble);
    cells.get("input")!.addNeighbor(p);
    cells.get("input")!.setContent(new Something(21));
    run(cells, new Map([["asyncDouble", p]]), ["asyncDouble"]);

    const out = cells.get("output")!.knows() as APromise<unknown>;
    expect(out instanceof APromise).toBe(true);
    expect(out.deferred.isRealized).toBe(false);

    await out.deferred.promise;
    expect(out.deferred.isRealized).toBe(true);
    expect(out.content()).toEqual(new Something(42));
  });
});
