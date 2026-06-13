import { placeholderPaths } from "../../src/data-network/placeholders.js";

describe("placeholderPaths", () => {
  // Capability — the feature codegen needs: the distinct paths a template references,
  // so a compiled `interpolate` body can pass exactly those roots to renderPrompt, and
  // the type-checker can validate each path against the function's parameter types.
  it("extracts a single placeholder path", () => {
    expect(placeholderPaths("Hi {{name}}!")).toEqual(["name"]);
  });

  // Capability — multiple distinct paths, returned in first-appearance order.
  it("extracts multiple paths in order of appearance", () => {
    expect(placeholderPaths("{{a}} then {{b}} then {{c}}")).toEqual(["a", "b", "c"]);
  });

  // Capability — dotted paths are returned whole (root-splitting is the caller's job).
  it("returns a dotted path intact", () => {
    expect(placeholderPaths("{{rec.body}} {{rec.mark}}")).toEqual(["rec.body", "rec.mark"]);
  });

  // Invariant — uses the SAME placeholder grammar as renderPrompt: whitespace tolerant.
  it("tolerates whitespace inside braces", () => {
    expect(placeholderPaths("{{ name }}")).toEqual(["name"]);
  });

  // Invariant — a repeated path appears once.
  it("deduplicates repeated paths", () => {
    expect(placeholderPaths("{{a}} {{a}} {{b}}")).toEqual(["a", "b"]);
  });

  // Boundary — a template with no placeholders yields no paths (and a lone brace
  // is not a placeholder).
  it("returns an empty list when there are no placeholders", () => {
    expect(placeholderPaths("no holes here, just a { single brace")).toEqual([]);
  });
});
