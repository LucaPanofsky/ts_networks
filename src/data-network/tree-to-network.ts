import { parser } from "./parser.js";
import type {
  ProgramAST, DataNetworkAST, RecordAST, FnAST, DeriveAST, LLMFnAST, EnumAST, GrammarAST, ParameterAST,
  Term, PropagateTerm, SwitchTerm, CellTerm, ConstantTerm,
  FieldDecl, TypedParam, TypeRef,
  Expr, LiteralExpr, VarExpr, CallExpr, BinaryExpr, UnaryExpr, FieldExpr,
  LetBinding, MatchExpr, MatchArm, MatchPattern,
} from "./types.js";

function posToLineCol(input: string, pos: number): { line: number; col: number } {
  const lines = input.slice(0, pos).split("\n");
  return { line: lines.length, col: (lines.at(-1)?.length ?? 0) + 1 };
}

export function parseProgram(input: string): ProgramAST {
  const tree = parser.parse(input);

  // Lezer is error-tolerant and never throws — detect syntax errors via error nodes.
  let firstErrorPos: number | null = null;
  tree.iterate({ enter: n => {
    if (n.type.isError && firstErrorPos === null) firstErrorPos = n.from;
  }});
  if (firstErrorPos !== null) {
    const { line, col } = posToLineCol(input, firstErrorPos);
    throw new Error(`Syntax error at line ${line}, col ${col}`);
  }

  const cursor = tree.cursor();
  const slice = (from: number, to: number) => input.slice(from, to);
  const cn = (): string => cursor.name;

  const networks: DataNetworkAST[] = [];
  const records: RecordAST[] = [];
  const fns: FnAST[] = [];
  const derives: DeriveAST[] = [];
  const llmFns: LLMFnAST[] = [];
  const enums: EnumAST[] = [];
  const grammars: GrammarAST[] = [];
  const parameters: ParameterAST[] = [];

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
    const params: Record<string, string> = {};
    cursor.nextSibling(); // As | From
    if (cursor.name === "As") {
      cursor.nextSibling(); // Name (coercion type)
      params["as"] = slice(cursor.from, cursor.to);
      cursor.nextSibling(); // From
    }
    cursor.nextSibling(); // CellList
    const from = collectCellList();
    cursor.nextSibling(); // To
    cursor.nextSibling(); // Name (to cell)
    const to = slice(cursor.from, cursor.to);
    if (cursor.nextSibling() && cursor.name === "WithClause") {
      Object.assign(params, collectParams());
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
    cursor.firstChild(); // Switch keyword
    cursor.nextSibling(); // FunctionName or From
    let fn: string | null = null;
    if (cursor.name === "FunctionName") {
      fn = collectFunctionName();
      cursor.nextSibling(); // From
    }
    cursor.nextSibling(); // CellList
    const from = collectCellList();
    cursor.nextSibling(); // To
    cursor.nextSibling(); // Name
    const to = slice(cursor.from, cursor.to);
    cursor.parent();
    return { kind: "switch", fn, from, to };
  };

  // ── FnSignature ──────────────────────────────────────────────────────────────
  // Shared by defn, defpredicate, defllmfn, and defgrammar — they all use the same
  // `from [Pred?(name), …] to (Name | [Name])` signature. Cursor must be on the
  // FnSignature node; on return it is restored to that node.

  const collectFnSignature = (): { params: TypedParam[]; returnType: TypeRef } => {
    const params: TypedParam[] = [];
    let returnType: TypeRef = { kind: "scalar", predicate: "" };
    let seenTo = false;
    if (!cursor.firstChild()) return { params, returnType };
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
      } else if (cn() === "VectorTypeRef" && seenTo) {
        cursor.firstChild(); cursor.nextSibling();
        const element = slice(cursor.from, cursor.to);
        cursor.parent();
        returnType = { kind: "vector", element };
      } else if (cn() === "Name" && seenTo) {
        returnType = { kind: "scalar", predicate: slice(cursor.from, cursor.to) };
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return { params, returnType };
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
      const op = input[cursor.from] === "-" ? "-" : "!";
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

    if (nodeName === "MatchExpr") {
      return collectMatchExpr();
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

  // ── match expression ──────────────────────────────────────────────────────

  const parsePattern = (): MatchPattern => {
    cursor.firstChild(); // RecordPattern or Name
    let pattern: MatchPattern;
    if (cursor.name === "RecordPattern") {
      cursor.firstChild(); // Name (record name)
      const recordName = slice(cursor.from, cursor.to);
      const bindings: { field: string; as: string }[] = [];
      while (cursor.nextSibling()) {
        if (cn() === "FieldBinding") {
          cursor.firstChild(); // Name (field)
          const field = slice(cursor.from, cursor.to);
          cursor.nextSibling(); // ":"
          cursor.nextSibling(); // Name (binding)
          const as_ = slice(cursor.from, cursor.to);
          cursor.parent();
          bindings.push({ field, as: as_ });
        }
      }
      cursor.parent(); // exit RecordPattern
      pattern = { kind: "record-pattern", recordName, bindings };
    } else {
      pattern = { kind: "wildcard" };
    }
    cursor.parent(); // exit Pattern
    return pattern;
  };

  const collectMatchArm = (): MatchArm => {
    cursor.firstChild(); // Pipe
    cursor.nextSibling(); // Pattern
    const pattern = parsePattern();
    cursor.nextSibling(); // When or Arrow
    let guard: Expr | null = null;
    if (cursor.name === "When") {
      cursor.nextSibling(); // Expr (guard)
      guard = parseExpr();
      cursor.nextSibling(); // Arrow
    }
    cursor.nextSibling(); // Expr (body)
    const body = parseExpr();
    cursor.parent();
    return { pattern, guard, body };
  };

  const collectMatchExpr = (): MatchExpr => {
    cursor.firstChild(); // Match keyword
    cursor.nextSibling(); // Expr (subject)
    const subject = parseExpr();
    const arms: MatchArm[] = [];
    while (cursor.nextSibling() && cursor.name === "MatchArm") {
      arms.push(collectMatchArm());
    }
    cursor.parent();
    return { kind: "match", subject, arms };
  };

  // ── EnumDef ────────────────────────────────────────────────────────────────

  const collectEnumDef = (): EnumAST => {
    cursor.firstChild(); // Defenum keyword
    cursor.nextSibling(); // Name
    const name = slice(cursor.from, cursor.to);
    const values: string[] = [];
    while (cursor.nextSibling()) {
      if (cursor.name === "String") {
        values.push(slice(cursor.from, cursor.to).slice(1, -1));
      }
    }
    cursor.parent();
    return { kind: "enum", name, values };
  };

  // ── DeriveDef ──────────────────────────────────────────────────────────────

  const collectDeriveDef = (): DeriveAST => {
    cursor.firstChild(); // Derive keyword
    cursor.nextSibling(); // Name (sub)
    const sub = slice(cursor.from, cursor.to);
    cursor.nextSibling(); // From keyword
    cursor.nextSibling(); // Name (sup)
    const sup = slice(cursor.from, cursor.to);
    cursor.parent();
    return { kind: "derive", sub, sup };
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
        cursor.nextSibling(); // Name or VectorTypeRef
        let type: import("./types.js").TypeRef;
        if (cn() === "VectorTypeRef") {
          cursor.firstChild(); // "["
          cursor.nextSibling(); // Name (element)
          const element = slice(cursor.from, cursor.to);
          cursor.parent();
          type = { kind: "vector", element };
        } else {
          type = { kind: "scalar", predicate: slice(cursor.from, cursor.to) };
        }
        cursor.parent();
        fields.push({ name: fieldName, type });
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return { kind: "record", name, fields };
  };

  // ── FnDef ──────────────────────────────────────────────────────────────────

  const collectFnDef = (isPredicate: boolean): FnAST => {
    let name = "";
    let params: TypedParam[] = [];
    let returnType: TypeRef = { kind: "scalar", predicate: "" };
    let body: Expr = { kind: "literal", value: 0 };

    if (!cursor.firstChild()) return { kind: "fn", isPredicate, name, params, returnType, body };
    do {
      if (cursor.name === "Name" && !name) {
        name = slice(cursor.from, cursor.to);
      } else if (cursor.name === "FnSignature") {
        ({ params, returnType } = collectFnSignature());
      } else if (cursor.name === "ExpressionBody") {
        cursor.firstChild(); // Expression_
        cursor.nextSibling(); // LetBody
        cursor.firstChild(); // first child of LetBody (LetBinding or Expr)
        const bindings: LetBinding[] = [];
        do {
          const nodeName = cursor.name as string;
          if (nodeName === "LetBinding") {
            cursor.firstChild(); // Let keyword
            cursor.nextSibling(); // Name
            const bindingName = slice(cursor.from, cursor.to);
            cursor.nextSibling(); // Expr
            const bindingValue = parseExpr();
            cursor.parent();
            bindings.push({ name: bindingName, value: bindingValue });
          } else {
            const bodyExpr = parseExpr();
            body = bindings.length > 0 ? { kind: "let", bindings, body: bodyExpr } : bodyExpr;
          }
        } while (cursor.nextSibling());
        cursor.parent(); // exit LetBody
        cursor.parent(); // exit ExpressionBody
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return { kind: "fn", isPredicate, name, params, returnType, body };
  };

  // ── LLMFnDef ───────────────────────────────────────────────────────────────

  const collectLLMFnDef = (): LLMFnAST => {
    let name = "";
    let params: TypedParam[] = [];
    let returnType: TypeRef = { kind: "scalar", predicate: "" };
    let config: Record<string, string> = {};
    let prompt = "";

    if (!cursor.firstChild()) return { kind: "llmfn", name, params, returnType, prompt, config };
    do {
      if (cursor.name === "Name" && !name) {
        name = slice(cursor.from, cursor.to);
      } else if (cursor.name === "FnSignature") {
        ({ params, returnType } = collectFnSignature());
      } else if (cursor.name === "WithClause") {
        config = collectParams();
      } else if (cursor.name === "PromptString") {
        const raw = slice(cursor.from, cursor.to);
        prompt = raw.slice(3, -3).trim();
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return { kind: "llmfn", name, params, returnType, prompt, config };
  };

  // ── GrammarDef ───────────────────────────────────────────────────────────────

  const collectGrammarDef = (): GrammarAST => {
    let name = "";
    let source = "";
    let signature: GrammarAST["signature"];

    if (!cursor.firstChild()) return { kind: "grammar", name, source };
    do {
      if (cursor.name === "Name" && !name) {
        name = slice(cursor.from, cursor.to);
      } else if (cursor.name === "FnSignature") {
        signature = collectFnSignature();
      } else if (cursor.name === "PromptString") {
        const raw = slice(cursor.from, cursor.to);
        source = raw.slice(3, -3).trim();
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return { kind: "grammar", name, source, signature };
  };

  // ── ParameterDef ───────────────────────────────────────────────────────────

  const collectParameterDef = (): ParameterAST => {
    let name = "";
    let type: TypeRef = { kind: "scalar", predicate: "" };
    let value: string | undefined;

    if (!cursor.firstChild()) return { kind: "parameter", name, type };
    do {
      if (cursor.name === "Name" && !name) {
        name = slice(cursor.from, cursor.to);
      } else if (cursor.name === "TypeClause") {
        cursor.firstChild(); // Type keyword
        cursor.nextSibling(); // ":"
        cursor.nextSibling(); // Name
        type = { kind: "scalar", predicate: slice(cursor.from, cursor.to) };
        cursor.parent();
      } else if (cursor.name === "ValueClause") {
        cursor.firstChild(); // Value keyword
        cursor.nextSibling(); // ":"
        cursor.nextSibling(); // PromptString
        const raw = slice(cursor.from, cursor.to);
        value = raw.slice(3, -3).trim();
        cursor.parent();
      }
    } while (cursor.nextSibling());
    cursor.parent();
    return { kind: "parameter", name, type, value };
  };

  // ── top-level walk ─────────────────────────────────────────────────────────

  cursor.firstChild(); // enter Document
  do {
    if (cursor.name === "Definition") {
      cursor.firstChild();
      if (cn() === "NetworkDef") networks.push(collectNetworkDef());
      else if (cn() === "RecordDef") records.push(collectRecordDef());
      else if (cn() === "FnDef") fns.push(collectFnDef(false));
      else if (cn() === "PredicateDef") fns.push(collectFnDef(true));
      else if (cn() === "DeriveDef") derives.push(collectDeriveDef());
      else if (cn() === "LLMFnDef") llmFns.push(collectLLMFnDef());
      else if (cn() === "EnumDef") enums.push(collectEnumDef());
      else if (cn() === "GrammarDef") grammars.push(collectGrammarDef());
      else if (cn() === "ParameterDef") parameters.push(collectParameterDef());
      cursor.parent();
    }
  } while (cursor.nextSibling());

  return { networks, records, fns, derives, llmFns, enums, grammars, parameters };
}

export function parseNetwork(input: string): DataNetworkAST {
  const program = parseProgram(input);
  if (program.networks.length === 0) throw new Error("No defnetwork found in input");
  return program.networks[0]!;
}
