import { parseProgram } from "../../src/data-network/tree-to-network.js";
import { validateExtract } from "../../src/sandbox/extract-runtime.js";

// Q3: static type-check rules for defextract. validateExtract reads ASTs only (no
// compilation), so the grammar bodies here are trivial valid Ohm — only the signatures
// (return records) and the record shapes matter.

const BASE = `
defrecord Point
  label: String?;
  body:  String?;
end

defrecord Paragraph
  number: String?;
  points: [Point?];
end

defrecord Article
  number:     String?;
  paragraphs: [Paragraph?];
end

defgrammar Article
  signature: from [String?(text)] to Article?;
  """ Article { doc = "x" } """
end

defgrammar Paragraph
  signature: from [String?(text)] to Paragraph?;
  """ Paragraph { p = "x" } """
end

defgrammar Point
  signature: from [String?(text)] to Point?;
  """ Point { pt = "x" } """
end
`;

function validate(extractBlock: string): string[] {
  const program = parseProgram(BASE + extractBlock);
  return validateExtract(program.extracts[0]!, program);
}

const VALID = `
defextract E
  within Article using grammar/Article
    scan Paragraph as paragraphs using grammar/Paragraph;
    within paragraphs
      scan Point as points using grammar/Point;
    end
  end
end
`;

describe("validateExtract: a well-formed extract", () => {
  test("the GDPR-shaped extract validates clean", () => {
    expect(validate(VALID)).toEqual([]);
  });
});

describe("validateExtract: cardinality (verb vs field)", () => {
  test("scan into a scalar field is rejected", () => {
    const errs = validate(`
defextract E
  within Article using grammar/Article
    scan Paragraph as number using grammar/Paragraph;
  end
end
`);
    expect(errs.some(e => /scan .* must fill a vector field/.test(e))).toBe(true);
  });

  test("parse into a vector field is rejected", () => {
    const errs = validate(`
defextract E
  within Article using grammar/Article
    parse Paragraph as paragraphs using grammar/Paragraph;
  end
end
`);
    expect(errs.some(e => /parse .* must fill a scalar field/.test(e))).toBe(true);
  });
});

describe("validateExtract: record agreement", () => {
  test("a bind whose record differs from the field's element is rejected", () => {
    const errs = validate(`
defextract E
  within Article using grammar/Article
    scan Point as paragraphs using grammar/Point;
  end
end
`);
    expect(errs.some(e => /field "paragraphs" holds Paragraph, not Point/.test(e))).toBe(true);
  });

  test("a grammar whose return record differs from the bind is rejected", () => {
    const errs = validate(`
defextract E
  within Article using grammar/Article
    scan Paragraph as paragraphs using grammar/Point;
  end
end
`);
    expect(errs.some(e => /grammar\/Point returns Point/.test(e))).toBe(true);
  });
});

describe("validateExtract: within targets", () => {
  test("within a non-field is rejected", () => {
    const errs = validate(`
defextract E
  within Article using grammar/Article
    within ghost
    end
  end
end
`);
    expect(errs.some(e => /no field "ghost"/.test(e))).toBe(true);
  });

  test("within a scalar field is rejected", () => {
    const errs = validate(`
defextract E
  within Article using grammar/Article
    within number
    end
  end
end
`);
    expect(errs.some(e => /must target a vector field/.test(e))).toBe(true);
  });
});

describe("validateExtract: root grammar", () => {
  test("a root grammar returning the wrong record is rejected", () => {
    const errs = validate(`
defextract E
  within Article using grammar/Paragraph
    scan Paragraph as paragraphs using grammar/Paragraph;
  end
end
`);
    expect(errs.some(e => /root grammar grammar\/Paragraph returns Paragraph, but the root is Article/.test(e))).toBe(true);
  });
});
