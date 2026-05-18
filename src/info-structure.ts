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
    return other instanceof Something && other.value === this.value;
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


