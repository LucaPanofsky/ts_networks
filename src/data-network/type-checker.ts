import type { ProgramAST, DataNetworkAST } from "./types.js";
import { typeRefToString } from "./types.js";

// ── Public types ──────────────────────────────────────────────────────────────

export type TypeError = {
  kind: "conflicting-cell-types" | "input-type-mismatch" | "unknown-predicate" | "arity-mismatch";
  message: string;
};

export type EnrichedCell = {
  name: string;
  writtenBy: Set<string>;
  readBy: Set<string>;
  _errors: TypeError[];
};

export type EnrichedPropagator = {
  kind: "propagate" | "switch";
  fn: string | null;
  from: string[];
  to: string;
  _errors: TypeError[];
};

export type EnrichedNetwork = {
  name: string;
  cells: Map<string, EnrichedCell>;
  propagators: EnrichedPropagator[];
};

// ── Internal helpers ──────────────────────────────────────────────────────────

type FnSignature = { params: string[]; returnType: string };

function buildFnMap(program: ProgramAST): Map<string, FnSignature> {
  const map = new Map<string, FnSignature>();
  for (const fn of program.fns) {
    map.set(fn.name, {
      params: fn.params.map(p => p.predicate),
      returnType: typeRefToString(fn.returnType),
    });
  }
  for (const llmFn of program.llmFns) {
    map.set(llmFn.name, {
      params: llmFn.params.map(p => p.predicate),
      returnType: typeRefToString(llmFn.returnType),
    });
  }
  return map;
}

function buildKnownPredicates(program: ProgramAST): Set<string> {
  const known = new Set(["String?", "Number?", "Boolean?"]);
  for (const r of program.records) known.add(`${r.name}?`);
  for (const e of program.enums) known.add(`${e.name}?`);
  for (const f of program.fns) if (f.isPredicate) known.add(f.name);
  return known;
}

// ── Core pass ─────────────────────────────────────────────────────────────────

export function typeCheck(network: DataNetworkAST, program: ProgramAST): EnrichedNetwork {
  const fnMap = buildFnMap(program);
  const known = buildKnownPredicates(program);

  const cells = new Map<string, EnrichedCell>();
  const propagators: EnrichedPropagator[] = [];

  const getCell = (name: string): EnrichedCell => {
    if (!cells.has(name)) {
      cells.set(name, { name, writtenBy: new Set(), readBy: new Set(), _errors: [] });
    }
    return cells.get(name)!;
  };

  // Seed all cells from the network signature
  for (const name of network.signature.from) getCell(name);
  getCell(network.signature.to);

  // ── Pass 1: propagate terms ────────────────────────────────────────────────

  for (const term of network.terms) {
    if (term.kind !== "propagate") continue;

    const ep: EnrichedPropagator = { kind: "propagate", fn: term.fn, from: term.from, to: term.to, _errors: [] };
    const sig = fnMap.get(term.fn);

    if (sig) {
      if (term.from.length !== sig.params.length) {
        ep._errors.push({
          kind: "arity-mismatch",
          message: `'${term.fn}' expects ${sig.params.length} argument(s) but got ${term.from.length}`,
        });
      }

      const returnType = sig.returnType;
      getCell(term.to).writtenBy.add(returnType);
      if (!known.has(returnType)) {
        ep._errors.push({ kind: "unknown-predicate", message: `return type '${returnType}' of '${term.fn}' is not defined` });
      }

      for (let i = 0; i < term.from.length; i++) {
        const paramType = sig.params[i];
        if (!paramType) continue;
        getCell(term.from[i]!).readBy.add(paramType);
        if (!known.has(paramType)) {
          ep._errors.push({ kind: "unknown-predicate", message: `parameter type '${paramType}' of '${term.fn}' is not defined` });
        }
      }
    }

    propagators.push(ep);
  }

  // ── Pass 2: switch terms ───────────────────────────────────────────────────
  // Runs after pass 1 so writtenBy on data cells is already populated.

  for (const term of network.terms) {
    if (term.kind !== "switch") continue;

    const ep: EnrichedPropagator = { kind: "switch", fn: term.fn ?? null, from: term.from, to: term.to, _errors: [] };

    // The first cell is always a boolean condition
    getCell(term.from[0]!).readBy.add("Boolean?");

    if (term.from.length >= 2) {
      // 2-arity: output type = type of the data cell
      const dataCell = getCell(term.from[1]!);
      const outCell = getCell(term.to);
      // Prefer writtenBy (producer), fall back to readBy (consumer inference)
      const dataType =
        dataCell.writtenBy.size === 1 ? [...dataCell.writtenBy][0]! :
        dataCell.readBy.size === 1   ? [...dataCell.readBy][0]!    :
        null;
      if (dataType) outCell.writtenBy.add(dataType);
    } else {
      // 1-arity: output is Boolean?
      getCell(term.to).writtenBy.add("Boolean?");
    }

    propagators.push(ep);
  }

  // ── Error annotation ───────────────────────────────────────────────────────

  for (const cell of cells.values()) {
    if (cell.writtenBy.size > 1) {
      cell._errors.push({
        kind: "conflicting-cell-types",
        message: `cell '${cell.name}' is written by multiple propagators with conflicting types: ${[...cell.writtenBy].join(", ")}`,
      });
    }

    if (cell.readBy.size > 1) {
      cell._errors.push({
        kind: "conflicting-cell-types",
        message: `cell '${cell.name}' is read by multiple propagators with conflicting type expectations: ${[...cell.readBy].join(", ")}`,
      });
    }

    if (cell.writtenBy.size === 1 && cell.readBy.size > 0) {
      const written = [...cell.writtenBy][0]!;
      for (const read of cell.readBy) {
        if (written !== read) {
          cell._errors.push({
            kind: "conflicting-cell-types",
            message: `cell '${cell.name}' is written as '${written}' but read as '${read}'`,
          });
        }
      }
    }
  }

  for (const ep of propagators) {
    if (ep.kind !== "propagate" || !ep.fn) continue;
    const sig = fnMap.get(ep.fn);
    if (!sig) continue;

    for (let i = 0; i < ep.from.length; i++) {
      const cell = cells.get(ep.from[i]!);
      const paramType = sig.params[i];
      if (!cell || !paramType) continue;

      const inferred =
        cell.writtenBy.size === 1 ? [...cell.writtenBy][0]! :
        cell.readBy.size === 1   ? [...cell.readBy][0]!    :
        null;

      if (inferred && inferred !== paramType) {
        ep._errors.push({
          kind: "input-type-mismatch",
          message: `propagator '${ep.fn}' expects '${paramType}' for '${ep.from[i]}' but cell has type '${inferred}'`,
        });
      }
    }
  }

  return { name: network.name, cells, propagators };
}

export function typeCheckProgram(program: ProgramAST): Map<string, EnrichedNetwork> {
  const result = new Map<string, EnrichedNetwork>();
  for (const network of program.networks) {
    result.set(network.name, typeCheck(network, program));
  }
  return result;
}
