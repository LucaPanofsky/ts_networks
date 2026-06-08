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

describe("renderPrompt — dotted paths", () => {
  // Capability — the feature: reach a field of a record argument. This is what
  // `defn ... interpolate from [Rec(rec)]` needs to render `{{rec.field}}`.
  it("resolves a one-level dotted path into a record arg", () => {
    expect(rendered("Body: {{rec.body}}", { rec: { body: "any*" } })).toBe("Body: any*");
  });

  // Capability — arbitrary nesting depth, walking one segment at a time.
  it("resolves a deeply nested dotted path", () => {
    expect(rendered("{{a.b.c}}", { a: { b: { c: "deep" } } })).toBe("deep");
  });

  // Invariant — the leaf is serialized by the SAME serializeArg as a bare key:
  // a record leaf becomes JSON, never "[object Object]".
  it("serializes a record-valued leaf as JSON", () => {
    const out = rendered("{{rec.inner}}", { rec: { inner: { k: "v" } } });
    expect(out).toContain('"k": "v"');
    expect(out).not.toContain("[object Object]");
  });

  // Capability — dotted and bare placeholders coexist in one template.
  it("mixes bare and dotted placeholders", () => {
    expect(rendered("{{name}}: {{rec.body}}", { name: "Point", rec: { body: "x" } }))
      .toBe("Point: x");
  });

  // Capability — whitespace tolerance survives the dot.
  it("tolerates whitespace around a dotted path", () => {
    expect(rendered("{{ rec.body }}", { rec: { body: "x" } })).toBe("x");
  });

  // Boundary — a present null LEAF is present (renders "null"), distinct from a
  // path that cannot be resolved. Presence is tested with `in` at every level.
  it("treats a present null leaf as present, not missing", () => {
    const result = renderPrompt("{{rec.body}}", { rec: { body: null } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.prompt).toBe("null");
  });

  // Boundary — a falsy leaf renders, it is not swallowed as empty.
  it("renders a falsy dotted leaf rather than empty string", () => {
    expect(rendered("{{rec.n}}", { rec: { n: 0 } })).toBe("0");
  });

  // Negative — the root segment is absent: report the FULL path so the error is
  // actionable, not just the missing first segment.
  it("reports the full dotted path when the root is absent", () => {
    const result = renderPrompt("{{rec.body}}", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["rec.body"]);
  });

  // Negative — the root is present but the sub-key is absent.
  it("reports the full dotted path when an intermediate key is absent", () => {
    const result = renderPrompt("{{rec.body}}", { rec: { other: 1 } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["rec.body"]);
  });

  // Negative / crash-guard — descending into a non-object intermediate (a scalar)
  // is "missing", NOT a thrown TypeError. The most valuable test here: it would
  // silently pass if the resolver naively indexed without a type guard.
  it("treats descent into a scalar intermediate as missing, not a crash", () => {
    const result = renderPrompt("{{rec.body}}", { rec: "scalar" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["rec.body"]);
  });

  // Negative / crash-guard — descending THROUGH null must not throw
  // (`"c" in null` is a TypeError); it resolves to missing.
  it("treats descent through a null intermediate as missing, not a crash", () => {
    const result = renderPrompt("{{a.b.c}}", { a: { b: null } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["a.b.c"]);
  });

  // Invariant — a repeated missing dotted path is reported once, like bare keys.
  it("deduplicates a repeated missing dotted path", () => {
    const result = renderPrompt("{{a.b}} {{a.b}}", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["a.b"]);
  });
});
