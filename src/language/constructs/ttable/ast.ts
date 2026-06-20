// The node `TTable` produces — a flat text-table extractor (text → [Row?]). It declares
// the row record, the cell delimiter, and one header per column. Shaped to MIRROR the
// engine's `TTableAST` (`kind` is the string "ttable" either way) so the runtime adapter
// casts it straight to the reused `compileTTable`.
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
