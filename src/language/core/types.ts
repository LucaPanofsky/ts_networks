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

// A typed, named parameter — a type predicate plus the bound name (`Number?(n)` →
// `{ predicate: "Number?", name: "n" }`). Shared by every fn-style signature
// (`defn`/`defpredicate`/`defllmfn`/`defgrammar`).
export type TypedParam = { predicate: string; name: string };

// The record's DATA shape (name + ordered typed fields) — the construct-agnostic view the
// heavy-construct compilers (grammar, ttable) and the LLM schema read to map captures →
// constructor args. This is the SINGLE SOURCE of that shape: `RecordNode` (defrecord/ast.ts)
// is `RecordDescriptor & { kind }`. It lives in `core/` so neither `core/module.ts` (EmitCtx)
// nor `core/runtime-api.ts` has to import the defrecord module (which would cycle).
export type RecordDescriptor = { name: string; fields: FieldDecl[] };

// Likewise the enum's data shape — `EnumNode` is `EnumDescriptor & { kind }`.
export type EnumDescriptor = { name: string; values: string[] };

// The type environment a `defllmfn` inlines so the reused engine `deriveProtocol` can build the
// model's structured-output JSON schema. It walks the return type through nested records, enums,
// and PREDICATE fns (a field typed `Probability?` resolves to its base primitive + a description),
// so all three are carried.
//
// `PredicateDescriptor` is the ONE descriptor that is NOT a derivable base of its node: it is a
// PROJECTION of `FnNode` (a fn VIEWED as a predicate for the schema — `body` is its `Expr`,
// opaque here as `unknown` so `core/` need not depend on the engine AST). `FnNode` can't derive
// from it (a fn is more than a predicate), and `core/` can't import `FnNode` (cycle), so it stays
// a hand-written projection — the irreducible limit of single-source here, kept minimal.
export type PredicateDescriptor = {
  name: string;
  params: TypedParam[];
  returnType: TypeRef;
  body: unknown;
};
export type LlmTypeEnv = {
  records: RecordDescriptor[];
  enums: EnumDescriptor[];
  predicates: PredicateDescriptor[];
};

// A network/extract-style port list: input cells and the single output cell.
export type Signature = { from: string[]; to: string };

// A fn-style signature — richer than the port-list `Signature`: typed, named params plus a
// return type. Shared by `defn`/`defllmfn`/`defgrammar` (produced by the shared `Signature`
// grammar rule + actions).
export type FnSignature = { params: TypedParam[]; returnType: TypeRef };

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
// The morphism (from/to over predicates) an entry presents to the rest of the program —
// the static face the runtime boundary (`runtime-api.ts`) and type checker speak in. (The
// dynamic face — the emitted JS — is produced by the module's `emit`.)
export type Morphism = { from: string[]; to: string };

// ── The splitter's output ────────────────────────────────────────────────────────

export type Block = {
  kind: ConstructKind;
  text: string; // the full block text, "defX ... end"
  offset: number; // start offset in the source (for diagnostics)
};
