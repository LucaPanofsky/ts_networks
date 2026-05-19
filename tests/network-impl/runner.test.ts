import { run } from "../../src/network-impl/runner.js";
import { Cell } from "../../src/network-impl/cell.js";
import { Propagator } from "../../src/network-impl/propagator.js";
import { Contradiction, Something } from "../../src/info-structure.js";
import { naryUnpacking } from "../../src/nary-unpacking.js";

const add = naryUnpacking((a: unknown, b: unknown) => (a as number) + (b as number), 2);
const double = naryUnpacking((a: unknown) => (a as number) * 2, 1);

function setup() {
  const cells = new Map([
    ["a", new Cell("a")],
    ["b", new Cell("b")],
    ["out", new Cell("out")],
  ]);
  const propagators = new Map([
    ["add", new Propagator("add", ["a", "b"], "out", add)],
  ]);
  cells.get("a")!.addNeighbor(propagators.get("add")!);
  cells.get("b")!.addNeighbor(propagators.get("add")!);
  return { cells, propagators };
}

describe("runner: basic execution", () => {
  test("runs a single propagator and returns cells", () => {
    const { cells, propagators } = setup();
    cells.get("a")!.setContent(new Something(3));
    cells.get("b")!.setContent(new Something(4));
    const result = run(cells, propagators, ["add"]);
    expect(result.type).toBe("done");
    expect(result.cells.get("out")!.knows().equals(new Something(7))).toBe(true);
  });

  test("returns the same cells map", () => {
    const { cells, propagators } = setup();
    const result = run(cells, propagators, ["add"]);
    expect(result.cells).toBe(cells);
  });

  test("empty candidates returns cells unchanged", () => {
    const { cells, propagators } = setup();
    cells.get("a")!.setContent(new Something(3));
    run(cells, propagators, []);
    expect(cells.get("out")!.knows().equals(new Something(3))).not.toBe(true);
  });
});

describe("runner: chained propagation", () => {
  test("propagates through a chain of two propagators", () => {
    const cells = new Map([
      ["a", new Cell("a")],
      ["b", new Cell("b")],
      ["mid", new Cell("mid")],
      ["out", new Cell("out")],
    ]);
    const addP = new Propagator("add", ["a", "b"], "mid", add);
    const doubleP = new Propagator("double", ["mid"], "out", double);
    cells.get("mid")!.addNeighbor(doubleP);
    const propagators = new Map([
      ["add", addP],
      ["double", doubleP],
    ]);
    cells.get("a")!.setContent(new Something(3));
    cells.get("b")!.setContent(new Something(4));
    run(cells, propagators, ["add"]);
    expect(cells.get("out")!.knows().equals(new Something(14))).toBe(true);
  });

  test("does not re-run propagators when no new info", () => {
    const { cells, propagators } = setup();
    cells.get("a")!.setContent(new Something(3));
    cells.get("b")!.setContent(new Something(4));
    run(cells, propagators, ["add"]);
    run(cells, propagators, ["add"]);
    expect(cells.get("out")!.knows().equals(new Something(7))).toBe(true);
  });
});

describe("runner: contradiction exit", () => {
  test("returns exit when a propagator produces a contradiction", () => {
    const cells = new Map([
      ["a", new Cell("a")],
      ["out", new Cell("out")],
    ]);
    cells.get("out")!.setContent(new Something(1));
    const conflict = naryUnpacking((_a: unknown) => 2, 1);
    const p = new Propagator("conflict", ["a"], "out", conflict);
    cells.get("a")!.addNeighbor(p);
    cells.get("a")!.setContent(new Something(99));
    const result = run(cells, new Map([["conflict", p]]), ["conflict"]);
    expect(result.type).toBe("exit");
    expect((result as { type: "exit"; reason: unknown }).reason).toBeInstanceOf(Contradiction);
  });
});

