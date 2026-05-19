import { Cell } from "../../src/network-impl/cell.js";
import { Nothing, Something, Contradiction } from "../../src/info-structure.js";

describe("Cell: name", () => {
  test("exposes its name", () => {
    expect(new Cell("myCell").name).toBe("myCell");
  });
});

describe("Cell: knows", () => {
  test("starts as Nothing by default", () => {
    expect(new Cell("x").knows()).toBe(Nothing);
  });

  test("starts with provided default", () => {
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
  test("resets content to Nothing by default", () => {
    const cell = new Cell("x");
    cell.mergeContent(new Something(42));
    cell.forget();
    expect(cell.knows()).toBe(Nothing);
  });

  test("resets content to provided default", () => {
    const def = new Something(0);
    const cell = new Cell("x", def);
    cell.mergeContent(new Something(99));
    cell.forget();
    expect(cell.knows()).toBe(def);
  });
});

describe("Cell: neighbors", () => {
  test("starts empty", () => {
    expect(new Cell("x").neighbors().size).toBe(0);
  });

  test("addNeighbor adds to the set", () => {
    const cell = new Cell("x");
    const neighbor = {};
    cell.addNeighbor(neighbor);
    expect(cell.neighbors().has(neighbor)).toBe(true);
  });

  test("adding same neighbor twice is idempotent", () => {
    const cell = new Cell("x");
    const neighbor = {};
    cell.addNeighbor(neighbor);
    cell.addNeighbor(neighbor);
    expect(cell.neighbors().size).toBe(1);
  });
});
