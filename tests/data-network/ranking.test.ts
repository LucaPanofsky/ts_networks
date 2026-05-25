import { DataNetwork } from "../../src/data-network/data-network.js";
import { rankPropagators } from "../../src/data-network/ranking.js";

const p = (fn: string, from: string[], to: string) => [fn, ...from, "to", to].join("__");

describe("rankPropagators: linear chain", () => {
  test("three-step chain is ranked in dependency order", () => {
    const net = new DataNetwork("test", { from: ["x"], to: "out" });
    net.addPropagator("f", ["x"], "a");
    net.addPropagator("g", ["a"], "b");
    net.addPropagator("h", ["b"], "out");
    expect(rankPropagators(net)).toEqual([p("f", ["x"], "a"), p("g", ["a"], "b"), p("h", ["b"], "out")]);
  });
});

describe("rankPropagators: diamond", () => {
  test("two parallel propagators come before the one that depends on both", () => {
    const net = new DataNetwork("test", { from: ["x"], to: "out" });
    net.addPropagator("f", ["x"], "a");
    net.addPropagator("g", ["x"], "b");
    net.addPropagator("h", ["a", "b"], "out");
    const ranked = rankPropagators(net);
    const hIdx = ranked.indexOf(p("h", ["a", "b"], "out"));
    expect(ranked.indexOf(p("f", ["x"], "a"))).toBeLessThan(hIdx);
    expect(ranked.indexOf(p("g", ["x"], "b"))).toBeLessThan(hIdx);
  });
});

describe("rankPropagators: independent propagators", () => {
  test("independent propagators are sorted by name", () => {
    const net = new DataNetwork("test", { from: ["a", "c"], to: "out" });
    net.addPropagator("g", ["c"], "d");
    net.addPropagator("f", ["a"], "b");
    expect(rankPropagators(net)).toEqual([p("f", ["a"], "b"), p("g", ["c"], "d")]);
  });
});

describe("rankPropagators: cycles", () => {
  test("returns all propagators even when a cycle is present", () => {
    const net = new DataNetwork("test", { from: [], to: "out" });
    net.addPropagator("f", ["y"], "x");
    net.addPropagator("g", ["x"], "y");
    const ranked = rankPropagators(net);
    expect(ranked).toHaveLength(2);
    expect(ranked).toContain(p("f", ["y"], "x"));
    expect(ranked).toContain(p("g", ["x"], "y"));
  });
});
