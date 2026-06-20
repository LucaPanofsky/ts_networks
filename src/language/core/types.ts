// Foundational, construct-agnostic types. Everything here is depended upon by the
// constructs and the pipeline, and depends on neither — this is the bottom layer.

// ── AST primitives shared across constructs ───────────────────────────────────
export type ScalarType = { kind: "scalar"; predicate: string };
export type VectorType = { kind: "vector"; element: string };
export type TypeRef = ScalarType | VectorType;

export const typeRefToString = (t: TypeRef): string =>
  t.kind === "scalar" ? t.predicate : `[${t.element}]`;

// A network/extract-style port list: input cells and the single output cell. (A `defn`
// signature is richer — typed, named params — so that shape lives in the defn module.)
export type Signature = { from: string[]; to: string };

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
