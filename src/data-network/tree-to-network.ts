import { parser } from "./parser.js";
import type { DataNetwork, Term, PropagateTerm, SwitchTerm, CellTerm, ConstantTerm } from "./types.js";

export function parseNetwork(input: string): DataNetwork {
  const tree = parser.parse(input);
  const cursor = tree.cursor();

  let name = "";
  let signature: DataNetwork["signature"] = { from: [], to: "" };
  const terms: Term[] = [];

  const slice = (from: number, to: number) => input.slice(from, to);

  // cursor must be positioned at a CellList node on entry
  const collectCellList = (): string[] => {
    const cells: string[] = [];
    if (!cursor.firstChild()) return cells;
    do {
      if (cursor.name === "Name") cells.push(slice(cursor.from, cursor.to));
    } while (cursor.nextSibling());
    cursor.parent();
    return cells;
  };

  // cursor must be positioned at a FunctionName node on entry
  const collectFunctionName = (): string => {
    const parts: string[] = [];
    if (!cursor.firstChild()) return "";
    do {
      if (cursor.name === "Name") parts.push(slice(cursor.from, cursor.to));
    } while (cursor.nextSibling());
    cursor.parent();
    return parts.join(".");
  };

  // cursor must be positioned at a WithClause node on entry
  const collectParams = (): Record<string, string> => {
    const params: Record<string, string> = {};
    if (!cursor.firstChild()) return params;
    do {
      if (cursor.name === "Param") {
        if (!cursor.firstChild()) continue;
        const key = slice(cursor.from, cursor.to); // Name
        cursor.nextSibling(); // String or Name (value)
        const raw = slice(cursor.from, cursor.to);
        const valueKind: string = cursor.name;
        params[key] = valueKind === "String" ? raw.slice(1, -1) : raw;
        cursor.parent();
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return params;
  };

  // cursor must be positioned at a PropagateTerm node on entry
  const collectPropagateTerm = (): PropagateTerm => {
    cursor.firstChild(); // FunctionName
    const fn = collectFunctionName();
    cursor.nextSibling(); // CellList
    const from = collectCellList();
    cursor.nextSibling(); // Name (to cell)
    const to = slice(cursor.from, cursor.to);
    let params: Record<string, string> = {};
    if (cursor.nextSibling() && cursor.name === "WithClause") {
      params = collectParams();
    }
    cursor.parent();
    return { kind: "propagate", fn, from, to, params };
  };

  // cursor must be positioned at a CellTerm or ConstantTerm node on entry
  const collectValueTerm = (kind: "cell" | "constant"): CellTerm | ConstantTerm => {
    cursor.firstChild(); // Name (cell/constant name)
    const termName = slice(cursor.from, cursor.to);
    cursor.nextSibling(); // String | Number | Boolean | Name (value)
    const raw = slice(cursor.from, cursor.to);
    const value = cursor.name === "String" ? raw.slice(1, -1) : raw;
    cursor.parent();
    return { kind, name: termName, value };
  };

  // cursor must be positioned at a SwitchTerm node on entry
  const collectSwitchTerm = (): SwitchTerm => {
    cursor.firstChild(); // CellList
    const from = collectCellList();
    cursor.nextSibling(); // Name (to cell)
    const to = slice(cursor.from, cursor.to);
    cursor.parent();
    return { kind: "switch", from: [from[0] ?? "", from[1] ?? ""], to };
  };

  cursor.firstChild(); // enter Network, now at first child

  do {
    switch (cursor.name) {
      case "Name":
        if (!name) name = slice(cursor.from, cursor.to);
        break;

      case "Signature": {
        cursor.firstChild(); // CellList
        const from = collectCellList();
        cursor.nextSibling(); // Name (to cell)
        signature = { from, to: slice(cursor.from, cursor.to) };
        cursor.parent();
        break;
      }

      case "Term": {
        cursor.firstChild();
        const termKind: string = cursor.name;
        if (termKind === "PropagateTerm") terms.push(collectPropagateTerm());
        else if (termKind === "SwitchTerm") terms.push(collectSwitchTerm());
        else if (termKind === "CellTerm") terms.push(collectValueTerm("cell"));
        else if (termKind === "ConstantTerm") terms.push(collectValueTerm("constant"));
        cursor.parent();
        break;
      }
    }
  } while (cursor.nextSibling());

  return { name, signature, terms };
}
