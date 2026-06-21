// The closed alphabet of the language: every construct kind, and the surface keyword
// the splitter dispatches on. Adding a construct starts HERE (then a module folder).
//
// This is the "file with all enums of the language" — the single source of truth for
// the construct vocabulary. The full inventory is 11 forms (record, enum, predicate,
// fn, llmfn, derive, grammar, extract, ttable, network, parameter); all are implemented
// (predicate folds into fn via an `isPredicate` flag, so there are 10 ConstructKind members).

export enum ConstructKind {
  Record  = "record",
  Fn      = "fn",
  Enum    = "enum",
  Derive  = "derive",
  Grammar = "grammar",
  Extract = "extract",
  TTable  = "ttable",
  Network = "network",
  Llmfn   = "llmfn",
  Parameter = "parameter",
  // Predicate — folded into Fn (isPredicate flag)
}

// Surface keyword → kind. The IMPLEMENTED subset: which keywords have a module, so which
// blocks the splitter actually emits and the pipeline can parse/emit. A construct's
// keyword moves here when its module lands.
export const KEYWORD_TO_KIND: Readonly<Record<string, ConstructKind>> = {
  defrecord:    ConstructKind.Record,
  defn:         ConstructKind.Fn,
  defpredicate: ConstructKind.Fn, // a predicate IS a fn (isPredicate flag); same module
  defenum:      ConstructKind.Enum,
  derive:       ConstructKind.Derive,
  defllmfn:     ConstructKind.Llmfn,
  defparameter: ConstructKind.Parameter,
  defgrammar:   ConstructKind.Grammar,
  defextract:   ConstructKind.Extract,
  TTable:       ConstructKind.TTable,
  defnetwork:   ConstructKind.Network,
};

// The full lexical surface: every top-level definition keyword the language has. The
// splitter ANCHORS on this set (a region runs to the next definition). It is identical to
// `KEYWORD_TO_KIND`'s keys today (every keyword has a module). The two are kept separate as
// an extension point: a future construct's keyword can be added here FIRST (so it acts as a
// boundary and isn't swallowed into the preceding block) before its module lands in
// KEYWORD_TO_KIND — only KEYWORD_TO_KIND members are emitted as blocks.
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
