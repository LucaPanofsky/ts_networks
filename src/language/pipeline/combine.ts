// Fold parsed nodes into a registry under MERGE SEMANTICS — the principle, not the
// propagator implementation. Two properties must hold so the real algebra can drop in
// later without touching the modules:
//
//   1. order-independent  — the result does not depend on declaration order
//      (a program is an unordered bag), and
//   2. conflict = error   — two declarations of the same name carrying *incompatible*
//      info is a Contradiction, NOT last-writer-wins. An identical re-declaration is
//      a harmless idempotent merge.
//
// That is exactly merge's discipline: monotone accumulation, contradiction on clash.

import type { AstNode } from "./program.js";
import { ConstructKind } from "../core/enums.js";
import { valueEquals } from "../../info-structure.js";

export type Registry = Map<string, AstNode>;

// The conflict-detection key for a node — its REGISTRY key, which is what `emit` registers
// and therefore the namespace a clash actually lives in. The heavy constructs are
// prefixed (`grammar/X`, `extract/X`, `TTable/X`), so a `defgrammar Foo` and a `defrecord
// Foo` are DISTINCT (they bind `grammar/Foo` and `Foo`) — keying by bare name would
// falsely conflate them. Records/fns key by their bare name (no prefix).
export function registryKey(node: AstNode): string {
  switch (node.kind) {
    case ConstructKind.Grammar:
      return `grammar/${node.name}`;
    case ConstructKind.Extract:
      return `extract/${node.name}`;
    case ConstructKind.TTable:
      return `TTable/${node.name}`;
    case ConstructKind.Parameter:
      // Parameters live in a separate engine namespace (`program.parameters`) and emit no
      // registry entry, so `parameter/X` keeps a `defparameter Foo` from falsely clashing
      // with a `defrecord Foo` — while two same-named parameters still conflict.
      return `parameter/${node.name}`;
    default:
      return node.name;
  }
}

export class ConstructConflict extends Error {
  constructor(
    public readonly key: string,
    public readonly existing: AstNode,
    public readonly incoming: AstNode,
  ) {
    super(`conflicting declarations for "${key}"`);
    this.name = "ConstructConflict";
  }
}

export function combine(nodes: readonly AstNode[]): Registry {
  const registry: Registry = new Map();
  for (const node of nodes) {
    const key = registryKey(node);
    const existing = registry.get(key);
    if (existing && !valueEquals(existing, node)) {
      throw new ConstructConflict(key, existing, node);
    }
    registry.set(key, node); // first-seen or idempotent re-merge
  }
  return registry;
}

// Equality for "same declaration?" — the algebra's own structural `valueEquals` (the single
// function the merge protocol routes through). ORDER-INDEPENDENT for plain objects (key-set +
// field-wise), so two structurally-identical nodes built with different field order are an
// idempotent re-merge, not a false conflict — unlike the JSON.stringify it replaced. (Reuses
// the algebra; does not change it.)
