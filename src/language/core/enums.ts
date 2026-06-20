// The closed alphabet of the language: every construct kind, and the surface keyword
// the splitter dispatches on. Adding a construct starts HERE (then a module folder).
//
// This is the "file with all enums of the language" — the single source of truth for
// the construct vocabulary. The full inventory is 11 forms (record, enum, predicate,
// fn, llmfn, derive, grammar, extract, ttable, network, parameter); the sketch wires
// the three we are prototyping and leaves the rest commented as the migration target.

export enum ConstructKind {
  Record  = "record",
  Fn      = "fn",
  Network = "network",
  // Enum, Predicate, LLMFn, Derive, Grammar, Extract, TTable, Parameter — as modules land
}

// Surface keyword → kind. The IMPLEMENTED subset: which keywords have a module, so which
// blocks the splitter actually emits and the pipeline can parse/emit. A construct's
// keyword moves here when its module lands.
export const KEYWORD_TO_KIND: Readonly<Record<string, ConstructKind>> = {
  defrecord:  ConstructKind.Record,
  defn:       ConstructKind.Fn,
  defnetwork: ConstructKind.Network,
};

// The full lexical surface: every top-level definition keyword the language has. The
// splitter ANCHORS on this set (a region runs to the next definition), even for
// constructs without a module yet — otherwise an unimplemented def (e.g. `defgrammar`)
// would be swallowed into the preceding block. Unimplemented keywords act purely as
// boundaries; only KEYWORD_TO_KIND members are emitted as blocks.
//
// `derive` ends with `;` (no `end`) and `defextract` nests `within … end` — neither
// matters to the splitter, which never counts `end`s (next-anchor boundaries).
export const DEFINITION_KEYWORDS: readonly string[] = [
  "defnetwork",
  "defrecord",
  "defn",
  "defpredicate",
  "defllmfn",
  "defenum",
  "defgrammar",
  "defextract",
  "defparameter",
  "derive",
  "TTable",
];
