import { parser } from "./parser.js";
import type {
  ProgramAST, DataNetworkAST, RecordAST, FnAST,
  Term, PropagateTerm, SwitchTerm, CellTerm, ConstantTerm,
  FieldDecl, TypedParam,
  Expr, LiteralExpr, VarExpr, CallExpr, BinaryExpr, UnaryExpr, FieldExpr,
} from "./types.js";

export function parseProgram(input: string): ProgramAST {
  const tree = parser.parse(input);
  const cursor = tree.cursor();
  const slice = (from: number, to: number) => input.slice(from, to);
  const cn = (): string => cursor.name;

  const networks: DataNetworkAST[] = [];
  const records: RecordAST[] = [];
  const fns: FnAST[] = [];

  // ── helpers ────────────────────────────────────────────────────────────────

  const collectCellList = (): string[] => {
    const cells: string[] = [];
    if (!cursor.firstChild()) return cells;
    do {
      if (cursor.name === "Name") cells.push(slice(cursor.from, cursor.to));
    } while (cursor.nextSibling());
    cursor.parent();
    return cells;
  };

  const collectFunctionName = (): string => {
    const parts: string[] = [];
    if (!cursor.firstChild()) return "";
    do {
      if (cursor.name === "Name") parts.push(slice(cursor.from, cursor.to));
    } while (cursor.nextSibling());
    cursor.parent();
    return parts.join(".");
  };

  const collectParams = (): Record<string, string> => {
    const params: Record<string, string> = {};
    if (!cursor.firstChild()) return params;
    do {
      if (cursor.name === "Param") {
        if (!cursor.firstChild()) continue;
        const key = slice(cursor.from, cursor.to);
        cursor.nextSibling();
        const raw = slice(cursor.from, cursor.to);
        const valueKind: string = cursor.name;
        params[key] = valueKind === "String" ? raw.slice(1, -1) : raw;
        cursor.parent();
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return params;
  };

  const collectPropagateTerm = (): PropagateTerm => {
    cursor.firstChild();
    cursor.nextSibling(); // FunctionName
    const fn = collectFunctionName();
    cursor.nextSibling(); // From
    cursor.nextSibling(); // CellList
    const from = collectCellList();
    cursor.nextSibling(); // To
    cursor.nextSibling(); // Name (to cell)
    const to = slice(cursor.from, cursor.to);
    let params: Record<string, string> = {};
    if (cursor.nextSibling() && cursor.name === "WithClause") {
      params = collectParams();
    }
    cursor.parent();
    return { kind: "propagate", fn, from, to, params };
  };

  const collectValueTerm = (kind: "cell" | "constant"): CellTerm | ConstantTerm => {
    cursor.firstChild();
    cursor.nextSibling(); // Name
    const termName = slice(cursor.from, cursor.to);
    cursor.nextSibling(); // value
    const raw = slice(cursor.from, cursor.to);
    const value = cursor.name === "String" ? raw.slice(1, -1) : raw;
    cursor.parent();
    return { kind, name: termName, value };
  };

  const collectSwitchTerm = (): SwitchTerm => {
    cursor.firstChild();
    cursor.nextSibling(); // From
    cursor.nextSibling(); // CellList
    const from = collectCellList();
    cursor.nextSibling(); // To
    cursor.nextSibling(); // Name
    const to = slice(cursor.from, cursor.to);
    cursor.parent();
    return { kind: "switch", from, to };
  };

  // ── expression parser ──────────────────────────────────────────────────────

  const parseExpr = (): Expr => {
    const nodeName = cursor.name;

    if (nodeName === "Expr") {
      cursor.firstChild();
      const result = parseExpr();
      cursor.parent();
      return result;
    }

    if (nodeName === "BinExpr") {
      cursor.firstChild();
      const left = parseExpr();
      cursor.nextSibling(); // operator (CompareOp | AddOp | MulOp | "||" | "&&")
      const op = slice(cursor.from, cursor.to);
      cursor.nextSibling();
      const right = parseExpr();
      cursor.parent();
      return { kind: "binary", op, left, right } as BinaryExpr;
    }

    if (nodeName === "UnaryExpr") {
      const op = "!"; // "!" token is anonymous — not in tree
      cursor.firstChild(); // Expr (operand)
      const expr = parseExpr();
      cursor.parent();
      return { kind: "unary", op, expr } as UnaryExpr;
    }

    if (nodeName === "FieldExpr") {
      cursor.firstChild(); // Expr
      const object = parseExpr();
      cursor.nextSibling(); // "."
      cursor.nextSibling(); // Name
      const field = slice(cursor.from, cursor.to);
      cursor.parent();
      return { kind: "field", object, field } as FieldExpr;
    }

    if (nodeName === "CallExpr") {
      cursor.firstChild(); // Name
      const fn = slice(cursor.from, cursor.to);
      const args: Expr[] = [];
      if (cursor.nextSibling() && cursor.name === "ArgList") {
        cursor.firstChild();
        do {
          if (cn() !== "⚠") args.push(parseExpr());
        } while (cursor.nextSibling());
        cursor.parent();
      }
      cursor.parent();
      return { kind: "call", fn, args } as CallExpr;
    }

    if (nodeName === "ParenExpr") {
      cursor.firstChild(); // "("
      cursor.nextSibling(); // Expr
      const inner = parseExpr();
      cursor.parent();
      return inner;
    }

    if (nodeName === "Number") {
      const raw = slice(cursor.from, cursor.to);
      return { kind: "literal", value: Number(raw) } as LiteralExpr;
    }

    if (nodeName === "String") {
      const raw = slice(cursor.from, cursor.to);
      return { kind: "literal", value: raw.slice(1, -1) } as LiteralExpr;
    }

    if (nodeName === "Boolean") {
      return { kind: "literal", value: slice(cursor.from, cursor.to) === "true" } as LiteralExpr;
    }

    // Name — variable reference
    return { kind: "var", name: slice(cursor.from, cursor.to) } as VarExpr;
  };

  // ── NetworkDef ─────────────────────────────────────────────────────────────

  const collectNetworkDef = (): DataNetworkAST => {
    let name = "";
    let signature: DataNetworkAST["signature"] = { from: [], to: "" };
    const terms: Term[] = [];

    if (!cursor.firstChild()) return { kind: "network", name, signature, terms };
    do {
      switch (cursor.name) {
        case "Name":
          if (!name) name = slice(cursor.from, cursor.to);
          break;
        case "Signature": {
          cursor.firstChild();
          cursor.nextSibling(); // From
          cursor.nextSibling(); // CellList
          const from = collectCellList();
          cursor.nextSibling(); // To
          cursor.nextSibling(); // Name
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
    cursor.parent();
    return { kind: "network", name, signature, terms };
  };

  // ── RecordDef ──────────────────────────────────────────────────────────────

  const collectRecordDef = (): RecordAST => {
    let name = "";
    const fields: FieldDecl[] = [];

    if (!cursor.firstChild()) return { kind: "record", name, fields };
    do {
      if (cursor.name === "Name" && !name) {
        name = slice(cursor.from, cursor.to);
      } else if (cursor.name === "FieldDecl") {
        cursor.firstChild(); // Name (field)
        const fieldName = slice(cursor.from, cursor.to);
        cursor.nextSibling(); // ":"
        cursor.nextSibling(); // Name (predicate)
        const predicate = slice(cursor.from, cursor.to);
        cursor.parent();
        fields.push({ name: fieldName, predicate });
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return { kind: "record", name, fields };
  };

  // ── FnDef ──────────────────────────────────────────────────────────────────

  const collectFnDef = (): FnAST => {
    let name = "";
    let params: TypedParam[] = [];
    let returnType = "";
    let body: Expr = { kind: "literal", value: 0 };

    if (!cursor.firstChild()) return { kind: "fn", name, params, returnType, body };
    do {
      if (cursor.name === "Name" && !name) {
        name = slice(cursor.from, cursor.to);
      } else if (cursor.name === "FnSignature") {
        let seenTo = false;
        if (!cursor.firstChild()) continue;
        do {
          if (cn() === "TypedParam") {
            const names: string[] = [];
            if (cursor.firstChild()) {
              do {
                if (cn() === "Name") names.push(slice(cursor.from, cursor.to));
              } while (cursor.nextSibling());
              cursor.parent();
            }
            if (names.length >= 2) params.push({ predicate: names[0]!, name: names[1]! });
          } else if (cn() === "To") {
            seenTo = true;
          } else if (cn() === "Name" && seenTo) {
            returnType = slice(cursor.from, cursor.to);
          }
        } while (cursor.nextSibling());
        cursor.parent();
      } else if (cursor.name === "ExpressionBody") {
        cursor.firstChild(); // Expression_
        cursor.nextSibling(); // Expr
        body = parseExpr();
        cursor.parent();
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return { kind: "fn", name, params, returnType, body };
  };

  // ── top-level walk ─────────────────────────────────────────────────────────

  cursor.firstChild(); // enter Document
  do {
    if (cursor.name === "Definition") {
      cursor.firstChild();
      if (cn() === "NetworkDef") networks.push(collectNetworkDef());
      else if (cn() === "RecordDef") records.push(collectRecordDef());
      else if (cn() === "FnDef") fns.push(collectFnDef());
      cursor.parent();
    }
  } while (cursor.nextSibling());

  return { networks, records, fns };
}

export function parseNetwork(input: string): DataNetworkAST {
  const program = parseProgram(input);
  if (program.networks.length === 0) throw new Error("No defnetwork found in input");
  return program.networks[0]!;
}
