// Reserved-JS-word guard for record fields — a codegen invariant. A record field is emitted
// into BOTH a binding position and a value position by a constructor
// (`(new) => ({ __type, new: new })`), so a reserved-word field produces invalid JS — a
// SyntaxError that would otherwise surface only at module eval, with no pointer back to the
// field. The object KEY would be legal (reserved words are fine as keys), but the parameter
// and value-position reference are not. A merely keyword-ish name like `type` is a legal JS
// identifier and is NOT listed — the check must reject only what actually breaks codegen.
//
// The `typecheck` operation consumes this to surface the located error early. (Moved out of
// the retired jsgen compiler; still keyed on `ProgramAST.records`.)

import type { ProgramAST } from "../data-network/types.js";

const RESERVED_JS_WORDS = new Set<string>([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for",
  "function", "if", "import", "in", "instanceof", "new", "null", "return", "super",
  "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with",
  // Reserved in strict mode / modules — our emitted constructors run in contexts that
  // may be strict, so reject these too rather than risk a context-dependent failure.
  "let", "static", "yield", "await", "implements", "interface", "package", "private",
  "protected", "public",
]);

// One message per record field whose name is a reserved JS word (empty = clean).
export function reservedFieldErrors(program: ProgramAST): string[] {
  const errors: string[] = [];
  for (const rec of program.records) {
    for (const f of rec.fields) {
      if (RESERVED_JS_WORDS.has(f.name)) {
        const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
        errors.push(`defrecord ${rec.name} — field "${f.name}" is a reserved JavaScript word; rename it (e.g. ${f.name}_, is${cap}).`);
      }
    }
  }
  return errors;
}
