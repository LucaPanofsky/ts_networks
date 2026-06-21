import { parseProgramStrict as parseProgram } from "../../src/language/parse-strict.js";
import { ttablesOf } from "../../src/language/select.js";
import { validateTTable } from "../../src/sandbox/ttable-runtime.js";
import { typecheck } from "../../src/operations/typecheck.js";

// Step 4: static type-check rules for TTable. validateTTable reads ASTs only.

function validate(dsl: string): string[] {
  const program = parseProgram(dsl);
  return validateTTable(ttablesOf(program)[0]!, program);
}

const VALID = `
defrecord Equivalence
  old:    String?;
  lisbon: String?;
  newNum: String?;
end

TTable Equivalences
  row: Equivalence;
  cell: '|';
  header old = 'Old';
  header lisbon = 'Lisbon';
  header newNum = 'New';
end
`;

describe("validateTTable", () => {
  test("a well-formed table validates clean", () => {
    expect(validate(VALID)).toEqual([]);
  });

  test("an unknown row record is rejected", () => {
    const errs = validate(`
TTable T
  row: Missing;
  cell: '|';
  header a = 'A';
end
`);
    expect(errs.some(e => /unknown row record "Missing"/.test(e))).toBe(true);
  });

  test("a header field that is not a record field is rejected", () => {
    const errs = validate(`
defrecord R old: String?; end
TTable T
  row: R;
  cell: '|';
  header ghost = 'Ghost';
end
`);
    expect(errs.some(e => /header field "ghost" is not a field of R/.test(e))).toBe(true);
  });

  test("a record field with no header is rejected (every column must be declared)", () => {
    const errs = validate(`
defrecord R old: String?; lisbon: String?; end
TTable T
  row: R;
  cell: '|';
  header old = 'Old';
end
`);
    expect(errs.some(e => /field "lisbon" of R has no header/.test(e))).toBe(true);
  });

  test("a declared (headerless) table validates clean", () => {
    expect(validate(`
defrecord R a: String?; b: String?; end
TTable T
  row: R;
  cell: '|';
  header a;
  header b;
end
`)).toEqual([]);
  });

  test("mixing located and declared headers is rejected", () => {
    const errs = validate(`
defrecord R a: String?; b: String?; end
TTable T
  row: R;
  cell: '|';
  header a = 'A';
  header b;
end
`);
    expect(errs.some(e => /use one mode/.test(e))).toBe(true);
  });

  test("an empty cell delimiter is rejected", () => {
    const errs = validate(`
defrecord R old: String?; end
TTable T
  row: R;
  cell: '';
  header old = 'Old';
end
`);
    expect(errs.some(e => /cell delimiter must not be empty/.test(e))).toBe(true);
  });
});

describe("typecheck operation: TTable rules", () => {
  test("a valid table type-checks", () => {
    expect(typecheck.handle({ source: VALID }).ok).toBe(true);
  });

  test("an unmapped field is rejected by typecheck", () => {
    const result = typecheck.handle({ source: `
defrecord R old: String?; lisbon: String?; end
TTable T
  row: R;
  cell: '|';
  header old = 'Old';
end
` });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/has no header/);
  });
});
