import type { NetworkMessage } from "./propagator.js";
import type { Propagator } from "./propagator.js";
import type { Cell } from "./cell.js";

type CellMap = Map<string, Cell>;

export class AsyncPropagator {
  private readonly _call: (cells: CellMap) => Promise<NetworkMessage>;

  constructor(name: string, call: (cells: CellMap) => Promise<NetworkMessage>);
  constructor(name: string, call: (cells: CellMap) => NetworkMessage);
  constructor(
    readonly name: string,
    call: ((cells: CellMap) => Promise<NetworkMessage>) | ((cells: CellMap) => NetworkMessage),
  ) {
    this._call = (cells) => Promise.resolve(call(cells));
  }

  call(cells: CellMap): Promise<NetworkMessage> {
    return this._call(cells);
  }
}

export function wrapSync(p: Propagator): AsyncPropagator {
  return new AsyncPropagator(p.name, (cells) => p.call(cells));
}
