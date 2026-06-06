import type { TTableAST, ProgramAST } from "../data-network/types.js";
import type { Sandbox } from "./jsgen/runtime.js";
import { Contradiction } from "../info-structure.js";

// A compiled TTable: a synchronous leaf, callable as `TTable/<name>` with arity 1
// (the input text), returning [Row?].
export type CompiledTTable = {
  arity: number;
  impl: (...args: unknown[]) => unknown;
};

// Flat text-table extraction — declarative, no Ohm:
//   1. lines containing the cell delimiter are the candidate rows; the FIRST is the
//      header. Split it (drop the closing-delimiter empty, trim) and match each
//      declared `header field = text` to a column by EXACT-AFTER-TRIM equality,
//      building a field→column-index map. A declared header with no column ⇒
//      Contradiction (the table self-validates).
//   2. each subsequent delimiter-line is a row: split, drop the closing empty, trim.
//      A cell count ≠ the header's column count ⇒ a Contradiction at that row's
//      position (malformed — refuse to guess). Otherwise build the row record,
//      placing each field's mapped cell ("" if empty — an asserted absence).
export function compileTTable(ast: TTableAST, program: ProgramAST, sandbox: Sandbox): CompiledTTable {
  const rec = program.records.find(r => r.name === ast.row);
  const fieldNames = rec ? rec.fields.map(f => f.name) : [];
  const delim = ast.cell;

  // Split a row on the delimiter, trim cells, and drop the one trailing empty cell a
  // closing delimiter produces (so `a | b |` is two cells, `a | b | |` is three).
  const splitRow = (line: string): string[] => {
    const cells = line.split(delim).map(c => c.trim());
    if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    return cells;
  };

  const impl = (...args: unknown[]): unknown => {
    const input = args[0];
    if (typeof input !== "string") return new Contradiction("ttable/not-a-string", new Set());
    const ctor = sandbox[ast.row];
    if (typeof ctor !== "function") {
      return new Contradiction("ttable/unknown-record", new Set(), new Error(`record "${ast.row}" not in sandbox`));
    }

    const rowLines = input.split("\n").filter(l => l.includes(delim));
    if (rowLines.length === 0) {
      return new Contradiction("ttable/no-header", new Set(), new Error("no line contains the cell delimiter"));
    }

    const headerCells = splitRow(rowLines[0]!);
    const indexByField = new Map<string, number>();
    for (const h of ast.headers) {
      const idx = headerCells.findIndex(c => c === h.text);
      if (idx < 0) {
        return new Contradiction("ttable/header-mismatch", new Set(),
          new Error(`header "${h.text}" (field "${h.field}") not found in: ${rowLines[0]}`));
      }
      indexByField.set(h.field, idx);
    }
    const columnCount = headerCells.length;

    const rows: unknown[] = [];
    for (const line of rowLines.slice(1)) {
      const cells = splitRow(line);
      if (cells.length !== columnCount) {
        rows.push(new Contradiction("ttable/malformed-row", new Set(),
          new Error(`expected ${columnCount} cells, got ${cells.length}: ${line}`)));
        continue;
      }
      const recordArgs = fieldNames.map(f => {
        const i = indexByField.get(f);
        return i === undefined ? "" : (cells[i] ?? "");
      });
      rows.push(ctor(...recordArgs));
    }
    return rows;
  };

  return { arity: 1, impl };
}

// Static type checks for a TTable (run by the typecheck operation). The table is
// SELF-DESCRIBING, so the invariant is that the declared headers and the row record's
// fields are the same set: the row record must exist; the delimiter must be non-empty;
// every declared header maps to a real field (no unknown / no duplicate); and every
// field of the row record has a header (no unmapped column). Returns one message per
// problem (empty = clean).
export function validateTTable(ast: TTableAST, program: ProgramAST): string[] {
  const errors: string[] = [];
  const here = `TTable ${ast.name}`;

  const rec = program.records.find(r => r.name === ast.row);
  if (!rec) {
    errors.push(`${here}: unknown row record "${ast.row}"`);
    return errors;
  }
  if (ast.cell === "") errors.push(`${here}: the cell delimiter must not be empty`);

  const recordFields = new Set(rec.fields.map(f => f.name));
  const declared = new Set<string>();
  for (const h of ast.headers) {
    if (!recordFields.has(h.field)) errors.push(`${here}: header field "${h.field}" is not a field of ${ast.row}`);
    if (declared.has(h.field)) errors.push(`${here}: duplicate header for field "${h.field}"`);
    declared.add(h.field);
  }
  for (const f of rec.fields) {
    if (!declared.has(f.name)) errors.push(`${here}: field "${f.name}" of ${ast.row} has no header (every column must be declared)`);
  }
  return errors;
}
