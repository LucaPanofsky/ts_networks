// A bounded-concurrency executor: it runs at most `cap` async tasks at once and
// parks the rest in a FIFO queue, starting each parked task as a slot frees up.
//
// Why this exists: an async network can fan out many leaf I/O calls at once (e.g.
// `propagate classify as mapping from [docs] to results` issues one model call per
// document). Without a cap, a 100-element vector fires 100 simultaneous calls —
// rate limits, socket exhaustion, cost. The executor turns "eager dispatch" into
// "eager *scheduling*": surplus work is parked, not dropped, so from the runtime's
// view a leaf call is still just a promise that resolves whenever it runs.
//
// The executor is deliberately domain-agnostic: it submits `() => Promise<T>` and
// returns `Promise<T>`, knowing nothing about InfoStructure/Something/APromise. The
// lattice mapping stays in the registry. The deadlock-avoidance invariant lives at
// the call site, not here: only *leaf* I/O (model calls) is submitted, never the
// orchestration that awaits it (the mapping fold, recursion) — so a running task
// never waits on a queued task, and the queue cannot deadlock.
//
// Per-task history (ids, status, timings — the "UI table") is intentionally absent
// for now; a serious implementation (e.g. SQLite-backed) is future work. Only the
// live counters below are kept, since they are O(1) and cannot grow.

interface Task {
  readonly thunk: () => Promise<unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

export class Executor {
  private _cap: number;
  private _running = 0;
  private _peak = 0;
  private readonly _queue: Task[] = [];

  constructor(cap = 8) {
    if (!Number.isInteger(cap) || cap < 1) {
      throw new Error(`Executor: cap must be a positive integer, got ${cap}`);
    }
    this._cap = cap;
  }

  // Submit a task. Returns a promise that settles with the thunk's result (or its
  // error) whenever the task is actually run. The handle is available now; the work
  // runs later — the same handle/value decoupling APromise/Deferred already use.
  submit<T>(thunk: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this._queue.push({
        thunk: thunk as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.pump();
    });
  }

  // Fill running slots up to the cap, draining the queue in FIFO order. Called on
  // every submit, on every completion (a freed slot pulls the next task), and on a
  // raised cap. The thunk is invoked *synchronously* here (so a fan-out smaller than
  // the cap dispatches all its calls in one tick); a synchronous throw is turned
  // into a rejection rather than escaping pump.
  private pump(): void {
    while (this._running < this._cap && this._queue.length > 0) {
      const task = this._queue.shift()!;
      this._running++;
      if (this._running > this._peak) this._peak = this._running;

      let work: Promise<unknown>;
      try {
        work = task.thunk();
      } catch (e) {
        work = Promise.reject(e);
      }

      work
        .then(task.resolve, task.reject)
        .finally(() => {
          this._running--;
          this.pump();
        });
    }
  }

  // Change the concurrency cap. Raising it immediately pumps parked tasks into the
  // newly available slots; lowering it only affects tasks submitted from now on
  // (running tasks are never interrupted).
  setCap(cap: number): void {
    if (!Number.isInteger(cap) || cap < 1) {
      throw new Error(`Executor: cap must be a positive integer, got ${cap}`);
    }
    this._cap = cap;
    this.pump();
  }

  get capacity(): number { return this._cap; }
  get inFlight(): number { return this._running; }
  get pending(): number { return this._queue.length; }
  // The high-water mark of concurrent tasks — proof of the cap and a basic metric.
  get peakInFlight(): number { return this._peak; }
}

// Shared instance used by the registry's llmfn impls so the cap is global across
// every propagator and network in a run. Override the default via the environment.
const envCap = process.env["TSN_MAX_CONCURRENCY"];
export const defaultExecutor = new Executor(
  envCap !== undefined && Number.isInteger(Number(envCap)) && Number(envCap) >= 1
    ? Number(envCap)
    : 8,
);
