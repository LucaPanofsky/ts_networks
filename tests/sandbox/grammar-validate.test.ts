import { validateGrammarSyntax, validateGrammarSignature, compileGrammar } from "../../src/sandbox/grammar-runtime.js";
import { parseProgramStrict as parseProgram } from "../../src/language/parse-strict.js";
import { recordsOf, grammarsOf } from "../../src/language/select.js";
import { recordCtorSandbox } from "../../src/sandbox/record-sandbox.js";
import type { GrammarAST } from "../../src/data-network/types.js";
import type { Program } from "../../src/language/pipeline/program.js";

// Parse a DSL program and pull out a named grammar AST. The validators are pure
// (no sandbox), so this is all the setup they need.
function grammarOf(dsl: string, name: string): { ast: GrammarAST; program: Program } {
  const program = parseProgram(dsl);
  const ast = grammarsOf(program).find(g => g.name === name)!;
  return { ast, program };
}

const goodScalar = `
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
`;

const goodScan = `
defrecord Citation
  title:   String?;
  section: String?;
end

defgrammar CiteScan
  signature: from [String?(text)] to [Citation?];
  """
  CiteScan {
    cite    = title spaces "U.S.C." spaces "§" spaces section
    title   = digit+
    section = digit+
  }
  """
end
`;

const bareRecognizer = `
defgrammar Word
  """
  Word {
    word = letter+
  }
  """
end
`;

// ── Capabilities: validateGrammarSyntax ────────────────────────────────────────

describe("validateGrammarSyntax", () => {
  test("a well-formed Ohm body validates clean", () => {
    const { ast } = grammarOf(goodScalar, "Cite");
    expect(validateGrammarSyntax(ast)).toEqual([]);
  });

  test("a bare recognizer (no signature) validates clean", () => {
    const { ast } = grammarOf(bareRecognizer, "Word");
    expect(validateGrammarSyntax(ast)).toEqual([]);
  });

  test("invalid Ohm source is reported", () => {
    const dsl = `
defgrammar Bad
  """
  this is not a valid ohm grammar
  """
end
`;
    const { ast } = grammarOf(dsl, "Bad");
    const errors = validateGrammarSyntax(ast);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/Bad/);
    expect(errors[0]).toMatch(/ohm/i);
  });

  test("an Ohm grammar named differently from the defgrammar is reported", () => {
    const dsl = `
defgrammar Cite
  """
  Wrong { x = "a" }
  """
end
`;
    const { ast } = grammarOf(dsl, "Cite");
    const errors = validateGrammarSyntax(ast);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/name/i);
  });
});

// ── Capabilities: validateGrammarSignature ─────────────────────────────────────

describe("validateGrammarSignature", () => {
  test("a signed grammar whose record exists validates clean (scalar)", () => {
    const { ast, program } = grammarOf(goodScalar, "Cite");
    expect(validateGrammarSignature(ast, program)).toEqual([]);
  });

  test("a signed grammar whose record exists validates clean (scan)", () => {
    const { ast, program } = grammarOf(goodScan, "CiteScan");
    expect(validateGrammarSignature(ast, program)).toEqual([]);
  });

  test("a bare recognizer has no signature to check", () => {
    const { ast, program } = grammarOf(bareRecognizer, "Word");
    expect(validateGrammarSignature(ast, program)).toEqual([]);
  });

  test("an unknown record in the signature is reported", () => {
    const dsl = `
defgrammar Cite
  signature: from [String?(text)] to Missing?;
  """
  Cite {
    cite = digit+
  }
  """
end
`;
    const { ast, program } = grammarOf(dsl, "Cite");
    const errors = validateGrammarSignature(ast, program);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/Missing/);
  });

  test("syntax errors do not surface here — that is validateGrammarSyntax's job", () => {
    const dsl = `
defgrammar Cite
  signature: from [String?(text)] to Missing?;
  """
  not valid ohm
  """
end
`;
    const { ast, program } = grammarOf(dsl, "Cite");
    // The Ohm body is broken, but the signature record is what this validator owns.
    const errors = validateGrammarSignature(ast, program);
    expect(errors.some(e => /Missing/.test(e))).toBe(true);
  });
});

// ── Invariant: validators agree with the runtime compiler ──────────────────────

describe("validators and compileGrammar stay in lockstep", () => {
  const cases = [
    { dsl: goodScalar, name: "Cite" },
    { dsl: goodScan, name: "CiteScan" },
    { dsl: bareRecognizer, name: "Word" },
  ];

  test.each(cases)("$name: clean validation ⇒ compileGrammar succeeds", ({ dsl, name }) => {
    const { ast, program } = grammarOf(dsl, name);
    expect(validateGrammarSyntax(ast)).toEqual([]);
    expect(validateGrammarSignature(ast, program)).toEqual([]);
    const sandbox = recordCtorSandbox(recordsOf(program));
    expect(() => compileGrammar(ast, program, sandbox)).not.toThrow();
  });

  test("a body validateGrammarSyntax rejects also makes compileGrammar throw", () => {
    const dsl = `
defgrammar Bad
  """
  not valid ohm
  """
end
`;
    const { ast, program } = grammarOf(dsl, "Bad");
    expect(validateGrammarSyntax(ast).length).toBeGreaterThan(0);
    // compileGrammar rejects the body before touching the sandbox, so an empty one is
    // enough to prove the throw.
    expect(() => compileGrammar(ast, program, {})).toThrow();
  });
});
