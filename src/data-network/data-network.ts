export type Cell = {
  name: string;
  content: unknown;
  defaultContent: unknown;
  isConstant: boolean;
  neighbors: Set<string>;
};

export type Propagator = {
  name: string;
  fn: string;
  from: string[];
  to: string;
  params: Record<string, string>;
};

export class DataNetwork {
  name: string;
  signature: { from: string[]; to: string };
  cells: Map<string, Cell> = new Map();
  propagators: Map<string, Propagator> = new Map();

  constructor(name: string, signature: { from: string[]; to: string }) {
    this.name = name;
    this.signature = signature;
  }

  addCell(name: string, options?: { content?: unknown; defaultContent?: unknown; isConstant?: boolean }): this {
    if (this.cells.has(name)) return this;
    this.cells.set(name, {
      name,
      content: options?.content,
      defaultContent: options?.defaultContent,
      isConstant: options?.isConstant ?? false,
      neighbors: new Set(),
    });
    return this;
  }

  addPropagator(fn: string, from: string[], to: string, params?: Record<string, string>): this {
    const name = [fn, ...from, "to", to].join("__");
    for (const cell of from) this.addCell(cell);
    this.addCell(to);
    for (const cell of from) this.cells.get(cell)!.neighbors.add(name);
    this.propagators.set(name, { name, fn, from, to, params: params ?? {} });
    return this;
  }
}
