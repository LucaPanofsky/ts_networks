// The node `TTable` produces — a flat text-table extractor (text → [Row?]). It declares
// the row record, the cell delimiter, and one header per column. This is the SINGLE table AST
// (the engine `TTableAST` twin was removed) — the reused `compileTTable` consumes it directly
// (the runtime adapter structurally casts the inlined spec to it).
//
// A header with `text` is LOCATED (matched by name in the header row, order-independent);
// without `text` it is POSITIONAL (mapped by declaration order). A table is one mode or the
// other — the reused compiler enforces that.

import { ConstructKind } from "../../core/enums.js";

export type TTableHeader = { field: string; text?: string };

export type TTableNode = {
  kind: ConstructKind.TTable;
  name: string;
  row: string;
  cell: string;
  headers: TTableHeader[];
};
