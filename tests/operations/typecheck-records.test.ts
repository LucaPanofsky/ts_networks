import { typecheck } from "../../src/operations/typecheck.js";

// The typecheck operation rejects a record whose field name is a reserved JavaScript
// word BEFORE the network type-checking — the constructor codegen would otherwise
// emit invalid JS that only blows up (cryptically) at sandbox build (#5).

const reservedFieldProgram = `
defrecord Clause
  new: String?;
end
`;

const cleanProgram = `
defrecord Clause
  text: String?;
end
`;

describe("typecheck operation: reserved-word record fields", () => {
  test("a reserved-word field is rejected with a clear, located message", () => {
    const result = typecheck.handle({ source: reservedFieldProgram });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Clause");
      expect(result.error).toContain(`"new"`);
      expect(result.error).toMatch(/reserved JavaScript word/i);
    }
  });

  test("a record with only legal field names type-checks clean", () => {
    const result = typecheck.handle({ source: cleanProgram });
    expect(result.ok).toBe(true);
  });
});
