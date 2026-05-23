import { I, Something, type InfoStructure } from "../info-structure.js";
import type { DataNetwork } from "../data-network/data-network.js";
import type { Registry } from "../registry.js";
import { naryUnpacking } from "../nary-unpacking.js";
import { rankPropagators } from "../data-network/ranking.js";
import { Cell } from "./cell.js";
import { Propagator, type NetworkMessage } from "./propagator.js";
import { run, type RunResult } from "./runner.js";

export class NetworkRuntime {
  private readonly _cells: Map<string, Cell>;
  private readonly _propagators: Map<string, Propagator>;
  private readonly _rankedPropagators: string[];

  constructor(network: DataNetwork, registry: Registry) {
    // Compile propagators: fn string → actual Propagator
    this._propagators = new Map();
    for (const [name, p] of network.propagators) {
        if (p.fn === "__RECURSIVE") {
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
}
