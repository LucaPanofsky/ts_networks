import { Contradiction } from "../info-structure.js";

export const ABORTED = new Contradiction("aborted", new Set());

export class Deferred<A> {
  readonly promise: Promise<A>;
  readonly signal: AbortSignal;
  private _resolve!: (value: A) => void;
  private _realized = false;
  private _value: A | undefined;
  private readonly controller: AbortController;

  constructor() {
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.promise = new Promise<A>(res => { this._resolve = res; });
  }

  resolve(value: A): void {
    if (this._realized) return;
    this._realized = true;
    this._value = value;
    this._resolve(value);
  }

  abort(): void {
    if (this._realized) return;
    this.controller.abort();
    this.resolve(ABORTED as unknown as A);
  }

  get isRealized(): boolean          { return this._realized; }
  get resolvedValue(): A | undefined { return this._value; }
}
