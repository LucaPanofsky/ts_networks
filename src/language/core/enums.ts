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

// Surface keyword → kind. The splitter peeks at a block's leading keyword and routes
// the block to the owning module via this map.
export const KEYWORD_TO_KIND: Readonly<Record<string, ConstructKind>> = {
  defrecord:  ConstructKind.Record,
  defn:       ConstructKind.Fn,
  defnetwork: ConstructKind.Network,
};
