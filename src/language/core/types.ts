// Foundational, construct-agnostic types. Everything here is depended upon by the
// constructs and the pipeline, and depends on neither — this is the bottom layer.

// ── AST primitives shared across constructs ───────────────────────────────────
export type ScalarType = { kind: "scalar"; predicate: string };
export type VectorType = { kind: "vector"; element: string };
export type TypeRef = ScalarType | VectorType;

export const typeRefToString = (t: TypeRef): string =>
  t.kind === "scalar" ? t.predicate : `[${t.element}]`;

// A field declaration shared by records and the descriptors heavy constructs inline.
export type FieldDecl = { name: string; type: TypeRef };

// The descriptor a heavy construct (grammar, ttable) needs about a record it produces:
// the name and the ordered, typed fields, so the reused engine compiler can map captures
// → constructor args (scalar vs vector). Structurally a RecordNode; named here so neither
// `core/module.ts` nor `core/runtime-api.ts` depends on the defrecord module.
export type RecordDescriptor = { name: string; fields: FieldDecl[] };

// The type environment a `defllmfn` inlines so the reused engine `deriveProtocol` can
// build the model's structured-output JSON schema. The schema walks the return type
// through nested records, enums, and PREDICATE fns (a field typed `Probability?` resolves
// to its base primitive + a description), so all three are carried. `body` is the
// predicate's expression — opaque here (an engine `Expr`), used only for the schema's
// description text; typed `unknown` so `core/` need not depend on the engine AST.
export type EnumDescriptor = { name: string; values: string[] };
export type PredicateDescriptor = {
  name: string;
  params: { predicate: string; name: string }[];
  returnType: TypeRef;
  body: unknown;
};
export type LlmTypeEnv = {
  records: RecordDescriptor[];
  enums: EnumDescriptor[];
  predicates: PredicateDescriptor[];
};

// A network/extract-style port list: input cells and the single output cell. (A `defn`
// signature is richer — typed, named params — so that shape lives in the defn module.)
export type Signature = { from: string[]; to: string };

// A scan-mode grammar match: the produced record paired with the EXACT substring the
// grammar consumed to produce it. The span is what powers `defextract`'s span-scoped
// nested recursion (a child scans only its parent's matched text). Mirrors the engine's
// `ScanMatch` (src/sandbox/grammar-runtime.ts); declared here so the runtime boundary
// (runtime-api.ts) need not import from the engine.
export type ScanMatch = { record: unknown; span: string };

// ── The node base ──────────────────────────────────────────────────────────────
import type { ConstructKind } from "./enums.js";

// Every construct node is named and tagged. The discriminant IS its construct kind, so
// post-merge dispatch (parse/emit) needs no string→kind mapping. The *contract*
// (module.ts) speaks only this base; the closed union of concrete nodes is assembled
// up in the pipeline (pipeline/program.ts), the only place that depends on all
// constructs.
export interface AstNodeBase {
  kind: ConstructKind;
  name: string;
}

// ── The static face of a registry entry ──────────────────────────────────────────
// What the type checker needs without building any impl: the morphism (from/to over
// predicates) the entry presents to the rest of the program. (The dynamic face — the
// emitted JS — is produced by the module's `emit`.) Not yet consumed; here so the
// shape is on record.
export type Morphism = { from: string[]; to: string };
export type EntryDecl = { key: string; arity: number; morphism: Morphism };

// ── The splitter's output ────────────────────────────────────────────────────────

export type Block = {
  kind: ConstructKind;
  keyword: string; // the leading keyword, e.g. "defrecord"
  text: string; // the full block text, "defX ... end"
  offset: number; // start offset in the source (for diagnostics)
};
