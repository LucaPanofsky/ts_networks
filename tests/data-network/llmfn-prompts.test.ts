import { parseProgramStrict as parseProgram } from "../../src/language/parse-strict.js";
import { llmFnsOf, recordsOf } from "../../src/language/select.js";
import { validateLLMFn } from "../../src/data-network/type-checker.js";
import { typecheck } from "../../src/operations/typecheck.js";

// `defllmfn` distinguishes a stable `system` prompt (task framing, no inputs) from the
// `user` prompt (data-bearing, carries {{placeholders}}). A bare unlabeled block is
// back-compat shorthand for the user prompt. The system prompt must contain no
// placeholders — enforced as a type error.

const SIG = "signature: from [String?(text)] to String?;";

describe("parse: system / user / bare prompt clauses", () => {
  test("labeled system + user populate both fields, delimiters stripped", () => {
    const p = parseProgram(`
      defllmfn f
        ${SIG}
        system """
        You are a careful analyst.
        """;
        user """
        Analyze: {{text}}
        """;
      end
    `);
    const f = llmFnsOf(p)[0]!;
    expect(f.system).toBe("You are a careful analyst.");
    expect(f.user).toBe("Analyze: {{text}}");
  });

  test("a bare block is the user prompt; no system", () => {
    const p = parseProgram(`
      defllmfn f
        ${SIG}
        """
        Analyze: {{text}}
        """;
      end
    `);
    const f = llmFnsOf(p)[0]!;
    expect(f.user).toBe("Analyze: {{text}}");
    expect(f.system).toBeUndefined();
  });

  test("system + a bare user block (system labeled, user unlabeled)", () => {
    const p = parseProgram(`
      defllmfn f
        ${SIG}
        system """
        Be terse.
        """;
        """
        {{text}}
        """;
      end
    `);
    const f = llmFnsOf(p)[0]!;
    expect(f.system).toBe("Be terse.");
    expect(f.user).toBe("{{text}}");
  });

  test("clause order is flexible: user before system", () => {
    const p = parseProgram(`
      defllmfn f
        ${SIG}
        user """{{text}}""";
        system """Be terse.""";
      end
    `);
    const f = llmFnsOf(p)[0]!;
    expect(f.system).toBe("Be terse.");
    expect(f.user).toBe("{{text}}");
  });

  test("`system` and `user` remain usable as ordinary identifiers (contextual keywords)", () => {
    // A record with fields named `system` and `user` must still parse.
    const p = parseProgram(`
      defrecord R
        system: String?;
        user: String?;
      end
    `);
    expect(recordsOf(p)[0]!.fields.map(f => f.name)).toEqual(["system", "user"]);
  });
});

describe("typecheck: system must be stable, user is required", () => {
  test("a placeholder in the system prompt is an ERROR", () => {
    const src = `
      defllmfn f
        ${SIG}
        system """You analyze {{text}}.""";
        user """{{text}}""";
      end
    `;
    const errs = validateLLMFn(parseProgram(src));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/system prompt must be stable/);
    expect(errs[0]).toMatch(/\{\{text\}\}/);
    // and the typecheck operation surfaces it as a failure
    expect(typecheck.handle({ source: src })).toMatchObject({ ok: false });
  });

  test("placeholders in the USER prompt are fine", () => {
    const src = `
      defllmfn f
        ${SIG}
        system """Be terse.""";
        user """Analyze {{text}} carefully.""";
      end
    `;
    expect(validateLLMFn(parseProgram(src))).toEqual([]);
    expect(typecheck.handle({ source: src })).toMatchObject({ ok: true });
  });

  test("a system-only llmfn (no user prompt) is an ERROR", () => {
    const src = `
      defllmfn f
        ${SIG}
        system """Be terse.""";
      end
    `;
    const errs = validateLLMFn(parseProgram(src));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/user prompt is required/);
  });

  test("a plain bare-prompt llmfn (no system) type-checks clean", () => {
    const src = `
      defllmfn f
        ${SIG}
        """Analyze {{text}}.""";
      end
    `;
    expect(validateLLMFn(parseProgram(src))).toEqual([]);
    expect(typecheck.handle({ source: src })).toMatchObject({ ok: true });
  });
});
