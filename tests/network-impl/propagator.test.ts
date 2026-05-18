import { Propagator, none } from "../../src/network-impl/propagator.js";
import { Cell } from "../../src/network-impl/cell.js";
import { Nothing, Something } from "../../src/info-structure.js";
import { naryUnpacking } from "../../src/nary-unpacking.js";

const add = naryUnpacking((a: unknown, b: unknown) => (a as number) + (b as number));

function makeCells(...names: string[]): Map<string, Cell> {
  return new Map(names.map(n => [n, new Cell(n)]));
}

describe("Propagator: name", () => {
  test("exposes its name", () => {
    const p = new Propagator("add", ["a", "b"], "out", add);
    expect(p.name).toBe("add");
  });
});

describe("Propagator: call", () => {
  test("merges result into output cell", () => {
    const cells = makeCells("a", "b", "out");
    cells.get("a")!.setContent(new Something(3));
    cells.get("b")!.setContent(new Something(4));
    const p = new Propagator("add", ["a", "b"], "out", add);
    p.call(cells);
    expect(cells.get("out")!.knows().equals(new Something(7))).toBe(true);
  });

  test("returns none when output cell did not change", () => {
    const cells = makeCells("a", "b", "out");
    cells.get("a")!.setContent(new Something(3));
    cells.get("b")!.setContent(new Something(4));
    const p = new Propagator("add", ["a", "b"], "out", add);
    p.call(cells);
    const msg = p.call(cells);
    expect(msg).toBe(none);
  });

  test("returns next with output cell neighbors when new info is produced", () => {
    const cells = makeCells("a", "b", "out");
    cells.get("a")!.setContent(new Something(3));
    cells.get("b")!.setContent(new Something(4));
    const downstream = new Propagator("downstream", ["out"], "result", add);
    cells.get("out")!.addNeighbor(downstream);
    const p = new Propagator("add", ["a", "b"], "out", add);
    const msg = p.call(cells);
    expect(msg).toEqual({ type: "next", propagators: cells.get("out")!.neighbors() });
  });

  test("returns none when inputs are Nothing", () => {
    const cells = makeCells("a", "b", "out");
    const p = new Propagator("add", ["a", "b"], "out", add);
    const msg = p.call(cells);
    expect(msg).toBe(none);
  });
});
