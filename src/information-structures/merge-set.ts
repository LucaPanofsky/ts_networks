import { isInfoStructure, valueEquals, type InfoStructure, Contradiction, Nothing } from "../info-structure.js";

// Distinct-by-value collection: drop any element value-equal to one already kept. O(n²),
// fine for the small domains constraint sets hold; a hash index is a future optimization.
function distinctByValue(elements: Iterable<unknown>): unknown[] {
  const out: unknown[] = [];
  for (const e of elements) {
    if (!out.some(x => valueEquals(x, e))) out.push(e);
  }
  return out;
}

// A set-valued information structure for constraint propagation. A cell holds the
// set of still-possible values; `merge` is set intersection, so two propagators
// writing the same cell *narrow* the domain. An empty domain — whether from an empty
// intersection or from every branch dropping out in `flatten` — means no value is
// consistent, so it becomes a Contradiction.
//
// `unpack` maps f over each element (a set is many values, unlike MergeObject which
// holds one), and `flatten` collapses the result — spreading nested MergeSets by
// union, dropping Nothing branches, and aborting on a Contradiction branch. Because
// `bind` is the shared `unpack(f).flatten()`, an n-ary propagator over several
// MergeSets produces the Cartesian product of their elements (the sequence monad).
export class MergeSet implements InfoStructure<unknown> {
  private readonly _elements: unknown[];

  constructor(elements: Iterable<unknown>) {
    // Dedup by structural value equality, so equal-but-distinct records collapse (not
    // by-reference). Consistent with `Something.equals` — one equality definition.
    this._elements = distinctByValue(elements);
  }

  static lift(values: Iterable<unknown>): MergeSet {
    return new MergeSet(values);
  }

  elements(): unknown[] {
    return [...this._elements];
  }

  content(): unknown {
    return [...this._elements];
  }

  equals(other: InfoStructure<unknown>): boolean {
    if (!(other instanceof MergeSet)) return false;
    if (this._elements.length !== other._elements.length) return false;
    // Both sides are already value-deduped, so equal length + this ⊆ other ⇒ equal.
    return this._elements.every(e => other._elements.some(x => valueEquals(x, e)));
  }

  unpack(f: (a: unknown) => unknown): InfoStructure<unknown> {
    return new MergeSet(this._elements.map(e => f(e)));
  }

  flatten(): InfoStructure<unknown> {
    const out: unknown[] = [];
    const conflict = this.walkInto(out);
    if (conflict) return conflict;
    // Every branch dropped: the domain is empty, i.e. unsatisfiable — same as an
    // empty intersection in `merge`.
    if (out.length === 0) return new Contradiction("flatten/empty-set", new Set([this]));
    return new MergeSet(out);
  }

  // Recursively walk elements into `out` as raw values — the set analogue of the
  // APromise walk. Nested MergeSets are spread at any depth (an empty branch simply
  // contributes nothing, like Nothing); a Nothing branch is dropped; the first
  // Contradiction short-circuits and is returned so `flatten` can abort. Returns
  // null when no conflict was found.
  private walkInto(out: unknown[]): Contradiction | null {
    for (const el of this._elements) {
      if (isInfoStructure(el)) {
        if (el === Nothing) continue;                 // drop dead branch
        if (el instanceof Contradiction) return el;   // a real conflict kills the set
        if (el instanceof MergeSet) {                 // union, descending into nesting
          const conflict = el.walkInto(out);
          if (conflict) return conflict;
          continue;
        }
        out.push((el as InfoStructure<unknown>).content());  // Something / value
      } else {
        out.push(el);
      }
    }
    return null;
  }

  bind(f: (a: unknown) => InfoStructure<unknown>): InfoStructure<unknown> {
    return this.unpack(f).flatten();
  }

  merge(other: InfoStructure<unknown>): InfoStructure<unknown> {
    if (other === Nothing) return this;
    if (other instanceof Contradiction) return other;
    if (other instanceof MergeSet) {
      const common = this._elements.filter(e => other._elements.some(x => valueEquals(x, e)));
      if (common.length === 0) {
        return new Contradiction("merge/empty-intersection", new Set([this, other]));
      }
      return new MergeSet(common);
    }
    // Any other type (Something, MergeObject, ...) is a type conflict. Return a
    // Contradiction directly rather than delegating with `other.merge(this)`, which
    // would infinitely ping-pong between two structures that don't know each other.
    return new Contradiction("merge/contradiction", new Set([this, other]));
  }

  abort(): Contradiction {
    return new Contradiction("aborted", new Set());
  }
}
