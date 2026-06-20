import type { RecordAST } from "../data-network/types.js";

// The value bindings a compiled grammar / ttable reads from at run time. Its ONLY use of the
// sandbox is to look up a record's CONSTRUCTOR by name (see grammar-runtime `buildRecord`:
// `sandbox[rec.name](...fieldValues)`). (The type lived in the retired jsgen runtime; it now
// lives here, beside the constructor builder its surviving consumers need.)
export type Sandbox = Record<string, (...args: unknown[]) => unknown>;

// Build a Sandbox of plain record constructors: `name → (...fieldValues) => { __type, …fields }`,
// positional over the record's declared fields (matching the order `buildRecord` calls them in
// and the engine's emitted constructor). This is all the `run-grammar` / `run-ttable` isolation
// tools need to compile ONE grammar/table against the program's records — no codegen, and no
// building of sibling grammars (whose bad bodies would otherwise throw and block the test).
export function recordCtorSandbox(records: RecordAST[]): Sandbox {
  const sandbox: Sandbox = {};
  for (const rec of records) {
    sandbox[rec.name] = (...args: unknown[]) => {
      const out: Record<string, unknown> = { __type: rec.name };
      rec.fields.forEach((f, i) => { out[f.name] = args[i]; });
      return out;
    };
  }
  return sandbox;
}
