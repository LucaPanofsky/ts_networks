import { Contradiction, type InfoStructure } from "../info-structure.js";
import { ABORTED, Deferred } from "./deferred.js";

function walkAPromise<A>(ap: APromise<A>): APromise<A> {
  if (ap.deferred.isRealized) {
    const v = ap.deferred.resolvedValue;
    if (v instanceof APromise) return walkAPromise(v as APromise<A>);
  }
  return ap;
}

function flattenAPromise<A>(ap: APromise<A>): APromise<A> {
  const walked = walkAPromise(ap);
  const d = walked.deferred;

  if (d.isRealized) {
    const v = d.resolvedValue;
    if (v instanceof APromise) return flattenAPromise(v as APromise<A>);
    const q = new Deferred<unknown>();
    q.resolve((v as InfoStructure<unknown>).flatten());
    return new APromise(q);
  }

  const q = new Deferred<unknown>();
  d.promise.then(v => {
    if (v instanceof APromise) {
      flattenAPromise(v as APromise<A>).deferred.promise.then(fv => q.resolve(fv));
    } else {
      q.resolve((v as InfoStructure<unknown>).flatten());
    }
  });
  return new APromise(q);
}

export class APromise<A> implements InfoStructure<A> {
  constructor(readonly deferred: Deferred<unknown>) {}

  content(): A {
    if (this.deferred.isRealized) {
      const v = this.deferred.resolvedValue;
      if (!(v instanceof APromise)) return v as A;
    }
    return undefined as unknown as A;
  }

  equals(other: InfoStructure<unknown>): boolean {
    return this === other;
  }

  unpack(f: (a: A) => unknown): InfoStructure<unknown> {
    const walked = walkAPromise(this);
    const q = new Deferred<unknown>();
    walked.deferred.promise.then(v => q.resolve(f(v as A)));
    return new APromise(q);
  }

  flatten(): InfoStructure<unknown> {
    return flattenAPromise(this);
  }

  bind(f: (a: A) => InfoStructure<unknown>): InfoStructure<unknown> {
    return this.unpack(f).flatten();
  }

  abort(): Contradiction {
    this.deferred.abort();
    return ABORTED;
  }

  merge(other: InfoStructure<unknown>): InfoStructure<unknown> {
    if (other instanceof APromise) {
      const d1 = walkAPromise(this).deferred;
      const d2 = walkAPromise(other).deferred;
      const q = new Deferred<unknown>();
      Promise.all([d1.promise, d2.promise])
        .then(([v1, v2]) => q.resolve((v1 as InfoStructure<unknown>).merge(v2 as InfoStructure<unknown>)));
      return new APromise(q);
    }
    const walked = walkAPromise(this);
    const q = new Deferred<unknown>();
    walked.deferred.promise.then(v => q.resolve((v as InfoStructure<unknown>).merge(other)));
    return new APromise(q);
  }
}
