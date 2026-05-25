import { Cell } from "../../src/network-impl/cell.js";
import { Nothing, Something, Contradiction } from "../../src/info-structure.js";

// ── Capabilities ──────────────────────────────────────────────────────────────

describe("Cell: knows", () => {
  test("starts as Nothing by default; starts with provided default when given one", () => {
    expect(new Cell("x").knows()).toBe(Nothing);
    const def = new Something(0);
    expect(new Cell("x", def).knows()).toBe(def);
  });
});

describe("Cell: setContent", () => {
  test("sets content directly", () => {
    const cell = new Cell("x");
    cell.setContent(new Something(42));
    expect(cell.knows().equals(new Something(42))).toBe(true);
  });
});

describe("Cell: mergeContent", () => {
  test("merges Nothing with Something → Something", () => {
    const cell = new Cell("x");
    cell.mergeContent(new Something(42));
    expect(cell.knows().equals(new Something(42))).toBe(true);
  });

  // ── Invariants ──────────────────────────────────────────────────────────────
  test("merging same value is idempotent", () => {
    const cell = new Cell("x");
    cell.mergeContent(new Something(42));
    cell.mergeContent(new Something(42));
    expect(cell.knows().equals(new Something(42))).toBe(true);
  });

  test("merging conflicting values produces Contradiction", () => {
    const cell = new Cell("x");
    cell.mergeContent(new Something(1));
    cell.mergeContent(new Something(2));
    expect(cell.knows() instanceof Contradiction).toBe(true);
  });
});

describe("Cell: forget", () => {
  test("resets content to Nothing by default; resets to provided default when given one", () => {
    const plain = new Cell("x");
    plain.mergeContent(new Something(42));
    plain.forget();
    expect(plain.knows()).toBe(Nothing);

    const def = new Something(0);
    const withDefault = new Cell("x", def);
    withDefault.mergeContent(new Something(99));
    withDefault.forget();
    expect(withDefault.knows()).toBe(def);
  });
});

describe("Cell: neighbors", () => {
  test("starts empty; addNeighbor adds to the set; adding same neighbor twice is idempotent", () => {
    const cell = new Cell("x");
    expect(cell.neighbors().size).toBe(0);
    const neighbor = {};
    cell.addNeighbor(neighbor);
    expect(cell.neighbors().has(neighbor)).toBe(true);
    cell.addNeighbor(neighbor);
    expect(cell.neighbors().size).toBe(1);
  });
});
