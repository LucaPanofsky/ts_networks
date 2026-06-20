// The node `defparameter` produces — a named, overridable network INPUT with an optional
// default. It is carry-only today: the existing engine parses and stores it (in
// `program.parameters`) but consumes it NOWHERE — no emitted JS, no registry entry, no
// network-seeding (the commit that added it scoped it to "parse + AST only; run-wiring and
// type-checking deferred"). The new pipeline carries it faithfully (the parameter is no
// longer silently dropped) and emits no runtime artifact; the teeth land later with the
// defnetwork slice + the `run` entry point that seeds parameters into cells.
//
// An absent `value` means the default is Nothing (the merge-algebra bottom) — a network
// reading an unfilled parameter simply produces no information.

import type { TypeRef } from "../../core/types.js";
import { ConstructKind } from "../../core/enums.js";

export type ParameterNode = {
  kind: ConstructKind.Parameter;
  name: string;
  type: TypeRef; // always a scalar TypeRef (a single type predicate)
  value?: string; // the optional default — opaque text (triple-quote wrapper stripped + trimmed)
};
