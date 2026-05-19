import type { InfoStructure } from "../info-structure.js";
import type { Cell } from "./cell.js";

export type NetworkMessage =
  | { type: "none" }
  | { type: "next"; propagators: Set<unknown> };

export const none: NetworkMessage = { type: "none" };

type CellMap = Map<string, Cell>;

function compileCall(
  inputNames: string[],
  outputName: string,
  unpacked: (...args: InfoStructure<unknown>[]) => InfoStructure<unknown>,
): (cells: CellMap) => NetworkMessage {
  switch (inputNames.length) {
    case 1: {
      const n0 = inputNames[0]!;
      return (cells) => {
        const result = unpacked(cells.get(n0)!.knows());
        const out = cells.get(outputName)!;
        const before = out.knows();
        out.mergeContent(result);
        if (out.knows().equals(before)) return none;
        return { type: "next", propagators: out.neighbors() };
      };
    }
    case 2: {
      const n0 = inputNames[0]!, n1 = inputNames[1]!;
      return (cells) => {
        const result = unpacked(cells.get(n0)!.knows(), cells.get(n1)!.knows());
        const out = cells.get(outputName)!;
        const before = out.knows();
        out.mergeContent(result);
        if (out.knows().equals(before)) return none;
        return { type: "next", propagators: out.neighbors() };
      };
    }
    case 3: {
      const n0 = inputNames[0]!, n1 = inputNames[1]!, n2 = inputNames[2]!;
      return (cells) => {
        const result = unpacked(cells.get(n0)!.knows(), cells.get(n1)!.knows(), cells.get(n2)!.knows());
        const out = cells.get(outputName)!;
        const before = out.knows();
        out.mergeContent(result);
        if (out.knows().equals(before)) return none;
        return { type: "next", propagators: out.neighbors() };
      };
    }
    case 4: {
      const n0 = inputNames[0]!, n1 = inputNames[1]!, n2 = inputNames[2]!, n3 = inputNames[3]!;
      return (cells) => {
        const result = unpacked(cells.get(n0)!.knows(), cells.get(n1)!.knows(), cells.get(n2)!.knows(), cells.get(n3)!.knows());
        const out = cells.get(outputName)!;
        const before = out.knows();
        out.mergeContent(result);
        if (out.knows().equals(before)) return none;
        return { type: "next", propagators: out.neighbors() };
      };
    }
    case 5: {
      const n0 = inputNames[0]!, n1 = inputNames[1]!, n2 = inputNames[2]!, n3 = inputNames[3]!, n4 = inputNames[4]!;
      return (cells) => {
        const result = unpacked(cells.get(n0)!.knows(), cells.get(n1)!.knows(), cells.get(n2)!.knows(), cells.get(n3)!.knows(), cells.get(n4)!.knows());
        const out = cells.get(outputName)!;
        const before = out.knows();
        out.mergeContent(result);
        if (out.knows().equals(before)) return none;
        return { type: "next", propagators: out.neighbors() };
      };
    }
    default:
      throw new Error(`Propagator: arity ${inputNames.length} is not supported (max 5)`);
  }
}

export class Propagator {
  private readonly _call: (cells: CellMap) => NetworkMessage;

  constructor(
    readonly name: string,
    inputNames: string[],
    outputName: string,
    unpacked: (...args: InfoStructure<unknown>[]) => InfoStructure<unknown>,
  ) {
    this._call = compileCall(inputNames, outputName, unpacked);
  }

  call(cells: CellMap): NetworkMessage {
    return this._call(cells);
  }
}
