import type { InfoStructure } from "../info-structure.js";
import type { Cell } from "./cell.js";

export type NetworkMessage =
  | { type: "none" }
  | { type: "next"; propagators: Set<unknown> };

export const none: NetworkMessage = { type: "none" };

export class Propagator {
  constructor(
    readonly name: string,
    private readonly inputNames: string[],
    private readonly outputName: string,
    private readonly unpacked: (...args: InfoStructure<unknown>[]) => InfoStructure<unknown>,
  ) {}

  call(cells: Map<string, Cell>): NetworkMessage {
    const inputs = this.inputNames.map(name => cells.get(name)!.knows());
    const result = this.unpacked(...inputs);
    const outputCell = cells.get(this.outputName)!;
    const before = outputCell.knows();
    outputCell.mergeContent(result);
    if (outputCell.knows().equals(before)) return none;
    return { type: "next", propagators: outputCell.neighbors() };
  }
}
