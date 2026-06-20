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
    if (existing && !structurallyEqual(existing, node)) {
      throw new ConstructConflict(key, existing, node);
    }
    registry.set(key, node); // first-seen or idempotent re-merge
  }
  return registry;
}

// Placeholder for the equality the merge algebra will eventually supply. Structural
// JSON equality is enough for the sketch (it makes re-declaration idempotent and any
// real difference a conflict); the real version is value merge over the registry shape.
function structurallyEqual(a: AstNode, b: AstNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
