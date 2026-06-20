// The node `defextract` produces — a constituency extractor: one root `within` (the
// document tree is a single record) built from nested `within`s and `scan`/`parse` binds.
// Shaped to MIRROR the engine's `ExtractAST`/`ExtractWithin`/`ExtractBind` (the inner `kind`
// strings — "within"/"scan"/"parse"/"extract" — match exactly) so the runtime adapter casts
// it straight to the reused `compileExtract`.
//
// A `scan`/`parse` binds a record-valued field to a leaf recogniser (grammar or TTable),
// the verb setting cardinality (scan → vector, parse → scalar). The ROOT within names the
// record TYPE and carries a grammar; a NESTED within names a FIELD a prior scan produced and
// recurses into each element scoped to the SPAN that element consumed (no grammar).

import { ConstructKind } from "../../core/enums.js";

export type ExtractBind = {
  kind: "scan" | "parse";
  record: string; // the element record recognised, e.g. "Paragraph"
  as: string; // the field it fills on the enclosing scope's record
  grammar: string; // the recogniser reference, e.g. "grammar/Paragraph" or "TTable/Rows"
};

export type ExtractWithin = {
  kind: "within";
  target: string; // root: record name; nested: field name
  grammar?: string; // root: grammar reference; nested: undefined
  body: ExtractStmt[];
};

export type ExtractStmt = ExtractBind | ExtractWithin;

export type ExtractNode = {
  kind: ConstructKind.Extract;
  name: string;
  root: ExtractWithin;
};
