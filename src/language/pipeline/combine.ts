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

export type Registry = Map<string, AstNode>;

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
    const existing = registry.get(node.name);
    if (existing && !structurallyEqual(existing, node)) {
      throw new ConstructConflict(node.name, existing, node);
    }
    registry.set(node.name, node); // first-seen or idempotent re-merge
  }
  return registry;
}

// Placeholder for the equality the merge algebra will eventually supply. Structural
// JSON equality is enough for the sketch (it makes re-declaration idempotent and any
// real difference a conflict); the real version is value merge over the registry shape.
function structurallyEqual(a: AstNode, b: AstNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
