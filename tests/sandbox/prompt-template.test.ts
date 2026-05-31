import { renderPrompt, serializeArg } from "../../src/sandbox/prompt-template.js";

// Helper: assert success and return the prompt, failing loudly otherwise.
function rendered(template: string, args: Record<string, unknown>): string {
  const result = renderPrompt(template, args);
  if (!result.ok) throw new Error(`expected ok, got missing: ${result.missing.join(", ")}`);
  return result.prompt;
}

describe("serializeArg", () => {
  // Capabilities — one assertion per distinct value shape.
  it("renders each value shape explicitly", () => {
    expect(serializeArg("hello")).toBe("hello");
    expect(serializeArg(42)).toBe("42");
    expect(serializeArg(3.14)).toBe("3.14");
    expect(serializeArg(true)).toBe("true");
    expect(serializeArg(false)).toBe("false");
  });

  // Capability — the bug this work fixes: records and arrays serialize as JSON,
  // never "[object Object]" or a lossy comma-join.
  it("serializes a record as pretty JSON, not [object Object]", () => {
    const record = { __type: "ArticleAnalysis", title: "Art. 6", actors: ["controller"] };
    const out = serializeArg(record);
    expect(out).not.toContain("[object Object]");
    expect(JSON.parse(out)).toEqual(record);
    expect(out).toContain("\n"); // pretty-printed
  });

  it("serializes an array structurally as JSON", () => {
    const out = serializeArg([{ id: "6(1)(a)" }, { id: "6(1)(b)" }]);
    expect(JSON.parse(out)).toEqual([{ id: "6(1)(a)" }, { id: "6(1)(b)" }]);
  });

  // Negative / boundary — null and undefined are handled, not crashed on.
  it("serializes null and undefined as \"null\"", () => {
    expect(serializeArg(null)).toBe("null");
    expect(serializeArg(undefined)).toBe("null");
  });
});

describe("renderPrompt", () => {
  // Capability — basic substitution.
  it("substitutes a present scalar placeholder", () => {
    expect(rendered("Hi {{name}}!", { name: "Luca" })).toBe("Hi Luca!");
  });

  // Capability — the chained-LLM-function case: a record value flows into the prompt.
  it("substitutes a record placeholder as JSON", () => {
    const out = rendered("Analysis:\n{{analysis}}", { analysis: { title: "Art. 6" } });
    expect(out).toContain('"title": "Art. 6"');
    expect(out).not.toContain("[object Object]");
  });

  // Invariant — a template with no placeholders is returned verbatim.
  it("returns a placeholder-free template unchanged", () => {
    expect(rendered("no placeholders here", { unused: 1 })).toBe("no placeholders here");
  });

  // Invariant — falsy-but-present values are NOT treated as missing/empty.
  it("renders falsy present values rather than empty string", () => {
    expect(rendered("{{n}} / {{flag}}", { n: 0, flag: false })).toBe("0 / false");
  });

  // Capability — tolerant of whitespace inside braces.
  it("matches placeholders with surrounding whitespace", () => {
    expect(rendered("{{ name }}", { name: "x" })).toBe("x");
  });

  // Capability — extra args that no placeholder references are harmless.
  it("ignores extra unreferenced args", () => {
    expect(rendered("{{a}}", { a: "1", b: "2", c: "3" })).toBe("1");
  });

  // Negative — a missing key surfaces as a value, not a silent "".
  it("reports missing variables instead of rendering empty", () => {
    const result = renderPrompt("{{analsis}} and {{types}}", { types: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["analsis"]);
  });

  // Negative / invariant — each missing key is reported once, even if repeated.
  it("deduplicates repeated missing keys", () => {
    const result = renderPrompt("{{x}} {{x}} {{y}}", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["x", "y"]);
  });

  // Boundary — a key present with null is allowed (distinct from absent).
  it("treats a present null value as present, not missing", () => {
    const result = renderPrompt("{{x}}", { x: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.prompt).toBe("null");
  });
});
