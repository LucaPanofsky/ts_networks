import { parseProgram } from "../data-network/tree-to-network.js";
import type { ProgramAST } from "../data-network/types.js";

// ts-networks standard library — the "prelude".
//
// These definitions are auto-supplied to EVERY program at compile time, so a program
// can `propagate not` / `add` / `max` (and call them inside expressions) without
// defining them first. Each is an ordinary `defn`, so every entry is BOTH propagatable
// (a registry entry, usable in `propagate`) AND usable inside an `expression` body —
// exactly like a hand-written function.
//
// A user `defn` of the same name SHADOWS the prelude entry (the user always wins); see
// `withPrelude` below — the same rule the compiler applies to the inline BUILTIN_DEFS.
//
// Written in the language itself (not implemented in TypeScript) so it stays legible and
// editable — an authoring agent can read and extend it — and so it is type-checked like
// any other source. Kept as a string constant rather than a separate `.tsn` file purely
// to avoid file I/O on the compile path (and an `import.meta` resolution snag under the
// test transform); it is otherwise plain `.tsn`. Host-only primitives the language
// cannot express live under the `math/` namespace of expression builtins (BUILTIN_DEFS
// in `src/language/pipeline/builtins.ts`); the wrappers below expose the propagatable-useful
// ones as `defn`s.
export const PRELUDE_SOURCE = `
// ── Booleans ──────────────────────────────────────────────────────────────────
defn not signature: from [Boolean?(x)] to Boolean?; expression !x; end
defn and signature: from [Boolean?(x), Boolean?(y)] to Boolean?; expression x && y; end
defn or  signature: from [Boolean?(x), Boolean?(y)] to Boolean?; expression x || y; end

// ── Arithmetic ────────────────────────────────────────────────────────────────
defn add signature: from [Number?(a), Number?(b)] to Number?; expression a + b; end
defn sub signature: from [Number?(a), Number?(b)] to Number?; expression a - b; end
defn mul signature: from [Number?(a), Number?(b)] to Number?; expression a * b; end
defn div signature: from [Number?(a), Number?(b)] to Number?; expression a / b; end

// ── Comparisons ───────────────────────────────────────────────────────────────
defn eq  signature: from [Any?(a), Any?(b)] to Boolean?; expression a == b; end
defn gt  signature: from [Number?(a), Number?(b)] to Boolean?; expression a > b; end
defn lt  signature: from [Number?(a), Number?(b)] to Boolean?; expression a < b; end
defn gte signature: from [Number?(a), Number?(b)] to Boolean?; expression a >= b; end
defn lte signature: from [Number?(a), Number?(b)] to Boolean?; expression a <= b; end

// ── Math (propagatable wrappers over the host math/ intrinsics) ────────────────
defn sqrt  signature: from [Number?(n)] to Number?; expression math/sqrt(n);  end
defn abs   signature: from [Number?(n)] to Number?; expression math/abs(n);   end
defn round signature: from [Number?(n)] to Number?; expression math/round(n); end
defn floor signature: from [Number?(n)] to Number?; expression math/floor(n); end
defn ceil  signature: from [Number?(n)] to Number?; expression math/ceil(n);  end
defn mod signature: from [Number?(a), Number?(b)] to Number?; expression math/mod(a, b); end
defn pow signature: from [Number?(a), Number?(b)] to Number?; expression math/pow(a, b); end
defn max signature: from [Number?(a), Number?(b)] to Number?; expression math/max(a, b); end
defn min signature: from [Number?(a), Number?(b)] to Number?; expression math/min(a, b); end
`;

const PRELUDE: ProgramAST = parseProgram(PRELUDE_SOURCE);

// Every named top-level definition kind, so a user definition of any of them shadows a
// same-named prelude function (the user always wins).
function definedNames(program: ProgramAST): Set<string> {
  return new Set<string>([
    ...program.fns.map(f => f.name),
    ...program.records.map(r => r.name),
    ...program.enums.map(e => e.name),
    ...program.grammars.map(g => g.name),
    ...program.extracts.map(e => e.name),
    ...program.ttables.map(t => t.name),
    ...program.llmFns.map(l => l.name),
  ]);
}

// Merge the prelude's functions into a parsed program, dropping any the program already
// defines (shadowing). The result is what the sandbox and registry compile against, so
// the prelude entries become both sandbox consts (expression-usable) and registry
// entries (propagatable). The prelude is supplied here, at compile time — it is NOT part
// of the user's AST, so `parse`/`typecheck`/`diagram` still report exactly what the user
// wrote.
export function withPrelude(program: ProgramAST): ProgramAST {
  const taken = definedNames(program);
  const preludeFns = PRELUDE.fns.filter(f => !taken.has(f.name));
  return { ...program, fns: [...preludeFns, ...program.fns] };
}
