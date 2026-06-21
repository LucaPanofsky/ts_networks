// The native intrinsics block emitted into every module's preamble.
//
// `BUILTIN_DEFS` maps a DSL name → a JS function-literal *string* for the host-only primitives
// the language cannot express itself: `str`/`every`/`some`, the `str/*` family, and the
// `math/*` family. `compileExpr` lowers a call to one of these to a BARE mangled identifier
// (`math$sqrt(…)`), so each must exist as a module-scope `const` — they cannot route through
// the `rt.` import. (Moved out of the retired jsgen compiler — this is now its only consumer.)
//
// `every`/`some` are general collection questions and stay flat. String functions are
// namespaced under `str/` (a qualified name — the `/` is mangled like any other identifier
// char). Strings are deliberately non-regex: literal split/join for replace, includes-based
// predicates. Host-only numeric primitives are namespaced under `math/`; the prelude wraps the
// propagatable-useful ones (`sqrt`, `abs`, `max`, …) as `defn`s.
//
// Shadowing: a user (or prelude) definition of the same name WINS — its `const` is emitted
// by the construct fragment, so we skip the intrinsic to avoid a duplicate declaration.

export const BUILTIN_DEFS: Record<string, string> = {
  every: `function(pred, coll) { return coll.every(function(x) { return pred(x); }); }`,
  some:  `function(pred, coll) { return coll.some(function(x) { return pred(x); }); }`,
  str:   `function() { return Array.prototype.slice.call(arguments).join(""); }`,
  "str/length":      `function(s) { return s.length; }`,
  "str/upper":       `function(s) { return s.toUpperCase(); }`,
  "str/lower":       `function(s) { return s.toLowerCase(); }`,
  "str/trim":        `function(s) { return s.trim(); }`,
  "str/substring":   `function(s, start, end) { return s.substring(start, end); }`,
  "str/split":       `function(s, sep) { return s.split(sep); }`,
  "str/join":        `function(coll, sep) { return coll.join(sep); }`,
  "str/replace":     `function(s, find, repl) { return s.split(find).join(repl); }`,
  "str/contains?":   `function(s, sub) { return s.includes(sub); }`,
  "str/startsWith?": `function(s, p) { return s.startsWith(p); }`,
  "str/endsWith?":   `function(s, p) { return s.endsWith(p); }`,
  "str/blank?":      `function(s) { return s.trim().length === 0; }`,
  "math/sqrt":  `function(n) { return Math.sqrt(n); }`,
  "math/abs":   `function(n) { return Math.abs(n); }`,
  "math/round": `function(n) { return Math.round(n); }`,
  "math/floor": `function(n) { return Math.floor(n); }`,
  "math/ceil":  `function(n) { return Math.ceil(n); }`,
  "math/mod":   `function(a, b) { return a % b; }`,
  "math/pow":   `function(a, b) { return Math.pow(a, b); }`,
  "math/max":   `function(a, b) { return Math.max(a, b); }`,
  "math/min":   `function(a, b) { return Math.min(a, b); }`,
};

// `declared` holds the MANGLED names every construct (+ prelude) will bind; `mangle` is the
// emitter's canonical name→identifier map (passed in to stay the single definition of it).
export function emitBuiltins(declared: ReadonlySet<string>, mangle: (name: string) => string): string {
  return Object.entries(BUILTIN_DEFS)
    .filter(([name]) => !declared.has(mangle(name)))
    .map(([name, fn]) => `const ${mangle(name)} = ${fn};`)
    .join("\n");
}
