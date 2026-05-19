import { Nothing, type InfoStructure } from "../info-structure.js";

export class Cell {
  private info: InfoStructure<unknown>;
  private _neighbors: Set<unknown> = new Set();

  constructor(
    readonly name: string,
    private readonly default_: InfoStructure<unknown> = Nothing,
  ) {
    this.info = default_;
  }

  knows(): InfoStructure<unknown> {
    return this.info;
  }

  neighbors(): Set<unknown> {
    return this._neighbors;
  }

  addNeighbor(neighbor: unknown): void {
    this._neighbors.add(neighbor);
  }

  mergeContent(content: InfoStructure<unknown>): void {
    this.info = this.info.merge(content);
  }

  setContent(content: InfoStructure<unknown>): void {
    this.info = content;
  }

  forget(): void {
    this.info = this.default_;
  }
}
