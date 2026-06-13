import { check } from "../../src/operations/check.js";
import { typecheck } from "../../src/operations/typecheck.js";

// A defgrammar carries its Ohm body verbatim, opaque to the parser — so a malformed
// Ohm body parses fine as DSL and only the dedicated grammar validation can catch it.
// `check` owns structural well-formedness of the body; `typecheck` adds the semantic
// signature checks (does the bound record exist?).

const goodProgram = `
defrecord Citation
  title:   String?;
  section: String?;
end

defgrammar Cite
  signature: from [String?(text)] to Citation?;
  """
  Cite {
    cite    = title spaces "U.S.C." spaces "§" spaces section
    title   = digit+
    section = digit+
  }
  """
end

defnetwork parseCitation
  signature: from [text] to citation;
  propagate grammar/Cite from [text] to citation;
end
`;

const malformedOhm = `
defgrammar Cite
  signature: from [String?(text)] to Citation?;
  """
  this is not a valid ohm grammar
  """
end

defrecord Citation
  title: String?;
end
`;

const nameMismatch = `
defgrammar Cite
  """
  Wrong { x = "a" }
  """
end
`;

const unknownRecord = `
defgrammar Cite
  signature: from [String?(text)] to Missing?;
  """
  Cite {
    cite = digit+
  }
  """
end
`;

describe("check operation: grammar body validation", () => {
  test("accepts a program whose grammar bodies are well-formed", () => {
    expect(check.handle({ source: goodProgram })).toEqual({ ok: true });
  });

  test("rejects a malformed Ohm body with the grammar name in the error", () => {
    const result = check.handle({ source: malformedOhm });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Cite/);
  });

  test("rejects an Ohm grammar named differently from the defgrammar", () => {
    const result = check.handle({ source: nameMismatch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/name/i);
  });

  test("does not flag an unknown signature record — that is a typecheck concern", () => {
    // The Ohm body is well-formed; only the bound record is missing, which `check`
    // (structural) deliberately leaves to `typecheck` (semantic).
    expect(check.handle({ source: unknownRecord })).toEqual({ ok: true });
  });
});

describe("typecheck operation: grammar signature validation", () => {
  test("accepts a program whose signature records all exist", () => {
    const result = typecheck.handle({ source: goodProgram });
    expect(result.ok).toBe(true);
  });

  test("rejects a signature binding to an unknown record", () => {
    const result = typecheck.handle({ source: unknownRecord });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Missing/);
  });

  test("rejects a malformed Ohm body too (typecheck runs the structural checks first)", () => {
    const result = typecheck.handle({ source: malformedOhm });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Cite/);
  });
});
