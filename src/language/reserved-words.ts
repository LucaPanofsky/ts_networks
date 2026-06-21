// Reserved-JS-word guard for record fields — a codegen invariant. A record field is emitted
// into BOTH a binding position and a value position by a constructor
// (`(new) => ({ __type, new: new })`), so a reserved-word field produces invalid JS — a
// SyntaxError that would otherwise surface only at module eval, with no pointer back to the
// field. The object KEY would be legal (reserved words are fine as keys), but the parameter
// and value-position reference are not. A merely keyword-ish name like `type` is a legal JS
// identifier and is NOT listed — the check must reject only what actually breaks codegen.
//
// The `typecheck` operation consumes this to surface the located error early. (Moved out of
// the retired jsgen compiler; reads the record nodes off a modular `Program`.)
//
// NOTE: codegen no longer DEPENDS on this guard — record field keys are emitted quoted
// (`{ "new": _0 }`) and accessed bracketed, so a reserved-word field would now emit valid JS.
// This guard is kept as a deliberate, conservative validation (predictable, plain field names),
// not a codegen necessity. The word list is shared with `mangle` via `core/reserved-js-words`.

import type { Program } from "./pipeline/program.js";
import { recordsOf } from "./select.js";
import { RESERVED_JS_WORDS } from "./core/reserved-js-words.js";

// One message per record field whose name is a reserved JS word (empty = clean).
export function reservedFieldErrors(program: Program): string[] {
  const errors: string[] = [];
  for (const rec of recordsOf(program)) {
    for (const f of rec.fields) {
      if (RESERVED_JS_WORDS.has(f.name)) {
        const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
        errors.push(`defrecord ${rec.name} — field "${f.name}" is a reserved JavaScript word; rename it (e.g. ${f.name}_, is${cap}).`);
      }
    }
  }
  return errors;
}
