import { I, type InfoStructure } from "../info-structure.js";
import type { DataNetwork } from "../data-network/data-network.js";
import type { Registry } from "../registry.js";
import { naryUnpacking } from "../nary-unpacking.js";
import { rankPropagators } from "../data-network/ranking.js";
import { Cell } from "./cell.js";
import { Propagator } from "./propagator.js";
import { run, type RunResult } from "./runner.js";

export class NetworkRuntime {
  private readonly _cells: Map<string, Cell>;
  private readonly _propagators: Map<string, Propagator>;
  private readonly _rankedPropagators: string[];

  constructor(network: DataNetwork, registry: Registry) {
    // Compile propagators: fn string → actual Propagator
    this._propagators = new Map();
    for (const [name, p] of network.propagators) {
      let unpacked: (...args: InfoStructure<unknown>[]) => InfoStructure<unknown>;
      if (p.fn === "__SWITCH") {
        const predName = p.params["predicate"] ?? "true?";
        const predEntry = registry.get(predName);
        if (!predEntry) throw new Error(`NetworkRuntime: unknown predicate "${predName}" for switch`);
        const switchImpl = (a: unknown, b: unknown) => predEntry.impl(a) ? b : null;
        unpacked = naryUnpacking(switchImpl, 2);
      } else {
        const entry = registry.get(p.fn);
        if (!entry) throw new Error(`NetworkRuntime: unknown function "${p.fn}" in registry`);
        unpacked = naryUnpacking(entry.impl, entry.arity);
      }
      this._propagators.set(name, new Propagator(name, p.from, p.to, unpacked));
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

    return run(freshCells, this._propagators, candidates);
  }
}
