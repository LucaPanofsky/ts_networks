export class Hierarchy<T> {
  private readonly parents: Map<T, Set<T>> = new Map();
  private ancestorsCache: Map<T, T[]> = new Map();
  private descendantsCache: Map<T, T[]> = new Map();

  derive(child: T, parent: T): this {
    if (child === parent) throw new Error("Cannot derive a type from itself");
    if (this._wouldCycle(child, parent)) throw new Error(`Cyclic derivation: ${String(child)} already descends from ${String(parent)}`);

    if (!this.parents.has(child)) this.parents.set(child, new Set());
    this.parents.get(child)!.add(parent);
    this._invalidateCaches();
    return this;
  }

  isDerived(child: T, parent: T): boolean {
    if (child === parent) return true;
    const directParents = this.parents.get(child);
    if (!directParents) return false;
    for (const p of directParents) {
      if (this.isDerived(p, parent)) return true;
    }
    return false;
  }

  ancestors(type: T): Set<T> {
    const cached = this.ancestorsCache.get(type);
    if (cached) return new Set(cached);
    const result = new Set<T>();
    this._collectAncestors(type, result, new Set());
    this.ancestorsCache.set(type, Array.from(result));
    return result;
  }

  descendants(type: T): Set<T> {
    const cached = this.descendantsCache.get(type);
    if (cached) return new Set(cached);
    const result = new Set<T>();
    for (const [child] of this.parents) {
      if (child !== type && this._hasAncestor(child, type, new Set())) result.add(child);
    }
    this.descendantsCache.set(type, Array.from(result));
    return result;
  }

  private _collectAncestors(type: T, acc: Set<T>, visited: Set<T>): void {
    if (visited.has(type)) return;
    visited.add(type);
    for (const parent of this.parents.get(type) ?? []) {
      acc.add(parent);
      this._collectAncestors(parent, acc, visited);
    }
  }

  private _hasAncestor(type: T, target: T, visited: Set<T>): boolean {
    if (type === target) return true;
    if (visited.has(type)) return false;
    visited.add(type);
    for (const parent of this.parents.get(type) ?? []) {
      if (this._hasAncestor(parent, target, visited)) return true;
    }
    return false;
  }

  private _wouldCycle(child: T, parent: T): boolean {
    return this._hasAncestor(parent, child, new Set());
  }

  private _invalidateCaches(): void {
    this.ancestorsCache.clear();
    this.descendantsCache.clear();
  }
}
