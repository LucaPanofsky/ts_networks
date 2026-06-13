export interface InfoStructure<A> {
  content(): A;
  equals(other: InfoStructure<unknown>): boolean;
  unpack(f: (a: A) => unknown): InfoStructure<unknown>;
  flatten(): InfoStructure<unknown>;
  bind(f: (a: A) => InfoStructure<unknown>): InfoStructure<unknown>;
  merge(other: InfoStructure<unknown>): InfoStructure<unknown>;
  abort(): Contradiction;
}

// ── Nothing ──────────────────────────────────────────────────────────────────

class NothingClass implements InfoStructure<undefined> {
  content(): undefined { return undefined; }
  equals(other: InfoStructure<unknown>): boolean { return other === this; }
  unpack(_f: (a: undefined) => unknown): InfoStructure<unknown> { return this; }
  flatten(): InfoStructure<unknown> { return this; }
  bind(_f: (a: undefined) => InfoStructure<unknown>): InfoStructure<unknown> { return this; }
  merge(other: InfoStructure<unknown>): InfoStructure<unknown> { return other; }
  abort(): Contradiction { return new Contradiction("aborted", new Set()); }
}

export const Nothing = new NothingClass();

// ── Contradiction ─────────────────────────────────────────────────────────────

export type Reason = unknown; // to be defined later

export class Contradiction implements InfoStructure<undefined> {
  constructor(
    readonly type: string,
    readonly args: Set<unknown>,
    readonly reason?: Reason
  ) {}

  content(): undefined { return undefined; }
  equals(other: InfoStructure<unknown>): boolean { return other instanceof Contradiction; }
  unpack(_f: (a: undefined) => unknown): InfoStructure<unknown> { return this; }
  flatten(): InfoStructure<unknown> { return this; }
  bind(_f: (a: undefined) => InfoStructure<unknown>): InfoStructure<unknown> { return this; }
  merge(_other: InfoStructure<unknown>): InfoStructure<unknown> { return this; }
  abort(): Contradiction { return new Contradiction("aborted", new Set()); }
}

// ── Something ─────────────────────────────────────────────────────────────────

export class Something<A> implements InfoStructure<A> {
  constructor(private readonly value: A) {}

  content(): A { return this.value; }

  equals(other: InfoStructure<unknown>): boolean {
    return other instanceof Something && valueEquals(other.value, this.value);
  }

  unpack(f: (a: A) => unknown): InfoStructure<unknown> {
    return I(f(this.value));
  }

  flatten(): InfoStructure<unknown> { return this; }

  bind(f: (a: A) => InfoStructure<unknown>): InfoStructure<unknown> {
    return this.unpack(f).flatten();
  }

  merge(other: InfoStructure<unknown>): InfoStructure<unknown> {
    if (other === Nothing) return this;
    if (this.equals(other)) return this;
    if (!(other instanceof Something) && !(other instanceof Contradiction)) return other.merge(this);
    return new Contradiction("merge/contradiction", new Set([this, other]));
  }

  abort(): Contradiction { return new Contradiction("aborted", new Set()); }
}

// ── I ────────────────────────────────────────────────────────────────────────

export function isInfoStructure(value: unknown): value is InfoStructure<unknown> {
  return (
    value === Nothing ||
    value instanceof Something ||
    value instanceof Contradiction ||
    (value !== null && typeof value === "object" && "bind" in value && "merge" in value && "content" in value)
  );
}

export function I(value: unknown): InfoStructure<unknown> {
  if (value === null || value === undefined) return Nothing;
  if (value instanceof Error) return new Contradiction("runtime/error", new Set(), value);
  if (isInfoStructure(value)) return value;
  return new Something(value);
}

// ── valueEquals ────────────────────────────────────────────────────────────────
//
// The single structural value-equality function the merge protocol routes through
// (`Something.equals`, `MergeSet` membership). It replaces a bare `===` so that two
// structurally-identical records/arrays count as equal even when they are distinct
// objects — without which `merge(a, a) = a` (idempotency) fails for any object value and
// re-derived/agreeing records spuriously contradict.
//
// Leaf rule is SameValueZero: `NaN` equals `NaN` (so a NaN-valued cell stays idempotent)
// and `+0` equals `-0`. Arrays compare length + element-wise (ordered); plain objects
// compare key-set + field-wise (order-insensitive). Anything that is not a primitive,
// array, or plain object (Date, class instance, function, …) falls back to identity — the
// value domain flowing through cells is JSON-ish and acyclic, so this stays total and
// terminating (no cycle guard needed for that domain).

function sameValueZero(a: unknown, b: unknown): boolean {
  return a === b || (a !== a && b !== b); // `x !== x` is true only for NaN
}

function isPlainObject(x: object): boolean {
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

export function valueEquals(a: unknown, b: unknown): boolean {
  if (sameValueZero(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr || bArr) {
    if (!aArr || !bArr || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valueEquals(a[i], b[i])) return false;
    }
    return true;
  }

  // Exotic objects (Date, class instances, …): identity only — already failed above.
  if (!isPlainObject(a) || !isPlainObject(b)) return false;

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  if (aKeys.length !== Object.keys(bo).length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bo, k) || !valueEquals(ao[k], bo[k])) return false;
  }
  return true;
}


