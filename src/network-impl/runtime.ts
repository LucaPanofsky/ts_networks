import { I, Something, Contradiction, type InfoStructure } from "../info-structure.js";
import { MergeObject } from "../information-structures/merge-object.js";
import { MergeSet } from "../information-structures/merge-set.js";
import type { DataNetwork } from "../data-network/data-network.js";
import type { Registry } from "../registry.js";
import { naryUnpacking } from "../nary-unpacking.js";
import { rankPropagators } from "../data-network/ranking.js";
import { Cell } from "./cell.js";
import { Propagator, type NetworkMessage } from "./propagator.js";
import { run, type RunResult } from "./runner.js";
import { AsyncPropagator, wrapSync } from "./async-propagator.js";
import { asyncRun } from "./async-runner.js";
import { APromise } from "../information-structures/apromise.js";

// Wrap a propagator's unpacked output so a successful (Something) record result
// becomes a MergeObject — the form that field-merges when two propagators write
// the same cell. Nothing and Contradiction pass through untouched. A Something
// whose content is not a plain object (number, string, array, ...) cannot be
// lifted, so it becomes a Contradiction.
function coerceToMergeObject(
  f: (...args: InfoStructure<unknown>[]) => InfoStructure<unknown>,
): (...args: InfoStructure<unknown>[]) => InfoStructure<unknown> {
  return (...args) => {
    const r = f(...args);
    if (!(r instanceof Something)) return r;
    const v = r.content();
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      return MergeObject.lift(v as Record<string, unknown>);
    }
    return new Contradiction("coerce/not-an-object", new Set([r]));
  };
}

// As coerceToMergeObject, but lifts a successful array result into a MergeSet — the
// set-intersection form. A Something whose content is not an array (number, string,
// plain object, ...) cannot be lifted, so it becomes a Contradiction.
function coerceToMergeSet(
  f: (...args: InfoStructure<unknown>[]) => InfoStructure<unknown>,
): (...args: InfoStructure<unknown>[]) => InfoStructure<unknown> {
  return (...args) => {
    const r = f(...args);
    if (!(r instanceof Something)) return r;
    const v = r.content();
    if (Array.isArray(v)) {
      // An empty array is an empty domain — unsatisfiable, not a valid set.
      if (v.length === 0) return new Contradiction("coerce/empty-set", new Set([r]));
      return MergeSet.lift(v);
    }
    return new Contradiction("coerce/not-a-collection", new Set([r]));
  };
}

// Maps an `as <Name>` clause to the wrapper that coerces a propagator's output.
type Coercion = (
  f: (...args: InfoStructure<unknown>[]) => InfoStructure<unknown>,
) => (...args: InfoStructure<unknown>[]) => InfoStructure<unknown>;

const COERCIONS = new Map<string, Coercion>([
  ["MergeObject", coerceToMergeObject],
  ["MergeSet", coerceToMergeSet],
]);

export class NetworkRuntime {
  private readonly _cells: Map<string, Cell>;
  private readonly _propagators: Map<string, Propagator>;
  private readonly _rankedPropagators: string[];
  private readonly _network: DataNetwork;

  constructor(network: DataNetwork, registry: Registry) {
    this._network = network;
    // Compile propagators: fn string → actual Propagator
    this._propagators = new Map();
    for (const [name, p] of network.propagators) {
      const asCoercion = p.params["as"];
      if (asCoercion !== undefined && !COERCIONS.has(asCoercion)) {
        throw new Error(`NetworkRuntime: unsupported coercion "as ${asCoercion}" (supported: ${[...COERCIONS.keys()].join(", ")})`);
      }
      if (p.fn === "__RECURSIVE") {
        if (asCoercion !== undefined) throw new Error(`NetworkRuntime: "as" coercion is not supported on a recursive propagate`);
        const fromNames = [...p.from];
        const signatureFrom = [...network.signature.from];
        const call = (cells: Map<string, Cell>): NetworkMessage => {
          const mappedInputs: Record<string, InfoStructure<unknown>> = {};
          for (let i = 0; i < signatureFrom.length; i++) {
            const info = cells.get(fromNames[i]!)!.knows();
            if (!(info instanceof Something)) return { type: "none" };
            mappedInputs[signatureFrom[i]!] = info;
          }
          return { type: "recurse", mappedInputs };
        };
        this._propagators.set(name, new Propagator(name, call));
      } else {
        let unpacked: (...args: InfoStructure<unknown>[]) => InfoStructure<unknown>;
        if (p.fn === "__SWITCH") {
          const predName = p.params["predicate"] ?? "true?";
          const predEntry = registry.get(predName);
          if (!predEntry) throw new Error(`NetworkRuntime: unknown predicate "${predName}" for switch`);
          if (p.from.length === 1) {
            unpacked = naryUnpacking(predEntry.impl, 1);
          } else {
            const switchImpl = (a: unknown, b: unknown) => predEntry.impl(a) ? b : null;
            unpacked = naryUnpacking(switchImpl, 2);
          }
        } else {
          const entry = registry.get(p.fn);
          if (!entry) throw new Error(`NetworkRuntime: unknown function "${p.fn}" in registry`);
          unpacked = naryUnpacking(entry.impl, entry.arity);
        }
        if (asCoercion !== undefined) unpacked = COERCIONS.get(asCoercion)!(unpacked);
        this._propagators.set(name, new Propagator(name, p.from, p.to, unpacked));
      }
    }

    // Build template cells: initial values + neighbor wiring
    this._cells = new Map();
    for (const [name, c] of network.cells) {
      const initial: InfoStructure<unknown> = c.content !== undefined ? I(c.content) : I(c.defaultContent);
      const cell = new Cell(name, initial);
      for (const neighborName of c.neighbors) {
        cell.addNeighbor(this._propagators.get(neighborName)!);
      }
      this._cells.set(name, cell);
    }

    this._rankedPropagators = rankPropagators(network);
  }

  get cells(): Map<string, Cell> {
    return this._cells;
  }

  get propagators(): Map<string, Propagator> {
    return this._propagators;
  }

  restart(cells: Map<string, Cell>, mappedInputs: Record<string, InfoStructure<unknown>>): string[] {
    for (const cell of cells.values()) cell.forget();
    for (const [name, info] of Object.entries(mappedInputs)) cells.get(name)!.setContent(info);
    return [...this._rankedPropagators];
  }

  invoke(inputs: Record<string, unknown>, worklist?: string[]): RunResult {
    // Fresh cells: same initial values and neighbor wiring, never mutate templates
    const freshCells = new Map<string, Cell>();
    for (const [name, template] of this._cells) {
      const fresh = new Cell(name, template.knows());
      for (const neighbor of template.neighbors()) {
        fresh.addNeighbor(neighbor);
      }
      freshCells.set(name, fresh);
    }

    // Lift and set caller-supplied inputs
    for (const [name, value] of Object.entries(inputs)) {
      const cell = freshCells.get(name);
      if (!cell) throw new Error(`NetworkRuntime.invoke: unknown cell "${name}"`);
      cell.setContent(I(value));
    }

    const candidates = worklist ?? this._rankedPropagators;
    const onRecurse = (mappedInputs: Record<string, InfoStructure<unknown>>) =>
      this.restart(freshCells, mappedInputs);

    return run(freshCells, this._propagators, candidates, onRecurse);
  }

  async invokeAsync(inputs: Record<string, unknown>, worklist?: string[]): Promise<RunResult> {
    const freshCells = new Map<string, Cell>();
    for (const [name, template] of this._cells) {
      const fresh = new Cell(name, template.knows());
      for (const neighbor of template.neighbors()) {
        fresh.addNeighbor(neighbor);
      }
      freshCells.set(name, fresh);
    }

    for (const [name, value] of Object.entries(inputs)) {
      const cell = freshCells.get(name);
      if (!cell) throw new Error(`NetworkRuntime.invokeAsync: unknown cell "${name}"`);
      cell.setContent(I(value));
    }

    // Build async propagator map: __RECURSIVE awaits APromise inputs; all others wrap sync.
    const asyncPropagators = new Map<string, AsyncPropagator>();
    for (const [name, p] of this._propagators) {
      asyncPropagators.set(name, wrapSync(p));
    }

    // Override __RECURSIVE propagators with async-aware versions.
    for (const [pName, p] of this._network.propagators) {
      if (p.fn !== "__RECURSIVE") continue;
      const fromNames = [...p.from];
      const signatureFrom = [...this._network.signature.from];
      asyncPropagators.set(pName, new AsyncPropagator(pName, async (cells) => {
        const mappedInputs: Record<string, InfoStructure<unknown>> = {};
        for (let i = 0; i < signatureFrom.length; i++) {
          let info = cells.get(fromNames[i]!)!.knows();
          if (info instanceof APromise) info = await info.deferred.promise as InfoStructure<unknown>;
          if (!(info instanceof Something)) return { type: "none" };
          mappedInputs[signatureFrom[i]!] = info;
        }
        return { type: "recurse", mappedInputs };
      }));
    }

    const candidates = worklist ?? this._rankedPropagators;
    const onRecurse = (mappedInputs: Record<string, InfoStructure<unknown>>) =>
      this.restart(freshCells, mappedInputs);

    return asyncRun(freshCells, asyncPropagators, candidates, onRecurse);
  }
}
