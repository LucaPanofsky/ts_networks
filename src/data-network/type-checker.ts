import type { ProgramAST, DataNetworkAST } from "./types.js";
import { typeRefToString } from "./types.js";

// ── Public types ──────────────────────────────────────────────────────────────

export type TypeError = {
  kind:
    | "conflicting-cell-types"
    | "input-type-mismatch"
    | "unknown-predicate"
    | "arity-mismatch"
    | "non-source-input"
    | "non-terminal-output";
  // Soundness violations are errors (the default when omitted). `non-source-input` /
  // `non-terminal-output` are *warnings*: legal under the merge algebra (a re-written
  // input merges; disagreement is a Contradiction value), just usually a wiring smell.
  severity?: "error" | "warning";
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
  // The param types as seen by the *cells*, after any `as` coercion. For `as mapping`
  // / `as filtering` these are the fn's params wrapped in a vector; otherwise the
  // fn's params verbatim. Pass 2 (input-type-mismatch) reads these so it agrees with
  // the cell types Pass 1 recorded.
  _paramTypes?: string[];
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
  // A signed grammar is callable as `grammar/<name>` and is fully typed like a fn: its
  // params and (scalar or vector) return type drive the same checks. Unsigned grammars
  // (bare recognizers) carry no types and are handled arity-only below.
  for (const grammar of program.grammars) {
    if (!grammar.signature) continue;
    map.set(`grammar/${grammar.name}`, {
      params: grammar.signature.params.map(p => p.predicate),
      returnType: typeRefToString(grammar.signature.returnType),
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

  // A network is callable as `network/<name>` with arity = its number of signature
  // inputs. Networks declare no cell *types*, so the only sound check is arity — and
  // it deliberately contributes nothing to cell type-inference (adding a synthetic
  // type here would create false "conflicting types" errors on shared cells).
  const networkArity = new Map<string, number>();
  for (const n of program.networks) networkArity.set(`network/${n.name}`, n.signature.from.length);
  // Unsigned grammars (bare recognizers) are arity-only callables, like networks: a
  // signature would have typed them into fnMap above. Their arity is always 1 (a string).
  for (const g of program.grammars) if (!g.signature) networkArity.set(`grammar/${g.name}`, 1);

  // A declared type is known if it is a known scalar predicate, or a vector `[X]`
  // whose element `X` is a known scalar (grammar scan returns and vector-valued fns).
  const isKnownType = (t: string): boolean =>
    t.startsWith("[") && t.endsWith("]") ? known.has(t.slice(1, -1)) : known.has(t);

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

      // An `as mapping` / `as filtering` coercion distributes the fn over a vector:
      // the cell types are the fn's types wrapped in `[...]`. Mapping yields a vector
      // of the return type; filtering keeps survivors, so it yields a vector of the
      // (single) input element type. The structure coercions (MergeObject/MergeSet)
      // post-process the value without changing arity, so types are unchanged.
      const coercion = term.params["as"];
      const isMapping = coercion === "mapping";
      const isFiltering = coercion === "filtering";
      const vec = (t: string) => `[${t}]`;

      const returnType =
        isMapping   ? vec(sig.returnType) :
        isFiltering ? vec(sig.params[0] ?? sig.returnType) :
        sig.returnType;
      getCell(term.to).writtenBy.add(returnType);
      if (!isKnownType(returnType)) {
        ep._errors.push({ kind: "unknown-predicate", message: `return type '${returnType}' of '${term.fn}' is not defined` });
      }

      const paramTypes = (isMapping || isFiltering) ? sig.params.map(vec) : sig.params;
      ep._paramTypes = paramTypes;
      for (let i = 0; i < term.from.length; i++) {
        const paramType = paramTypes[i];
        if (!paramType) continue;
        getCell(term.from[i]!).readBy.add(paramType);
        if (!isKnownType(paramType)) {
          ep._errors.push({ kind: "unknown-predicate", message: `parameter type '${paramType}' of '${term.fn}' is not defined` });
        }
      }
    } else if (networkArity.has(term.fn)) {
      // A sub-network reference: check arity only. Register the cells so they appear
      // in the topology, but add no types (networks are untyped at the cell level).
      const arity = networkArity.get(term.fn)!;
      if (term.from.length !== arity) {
        ep._errors.push({
          kind: "arity-mismatch",
          message: `'${term.fn}' expects ${arity} argument(s) but got ${term.from.length}`,
        });
      }
      getCell(term.to);
      for (const c of term.from) getCell(c);
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

    const paramTypes = ep._paramTypes ?? sig.params;
    for (let i = 0; i < ep.from.length; i++) {
      const cell = cells.get(ep.from[i]!);
      const paramType = paramTypes[i];
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

  // ── Topology warnings ──────────────────────────────────────────────────────
  // A well-formed network reads its signature inputs and writes its signature
  // output; the reverse (an input written by a propagator, an output fed back into
  // one) is legal under the merge algebra but usually a wiring mistake. Walk the
  // terms directly so untyped sub-network/switch wiring counts too.
  const writtenCells = new Set<string>();
  const readCells = new Set<string>();
  for (const term of network.terms) {
    if (term.kind === "propagate" || term.kind === "switch") {
      writtenCells.add(term.to);
      for (const c of term.from) readCells.add(c);
    }
  }
  for (const name of network.signature.from) {
    if (writtenCells.has(name)) {
      getCell(name)._errors.push({
        kind: "non-source-input",
        severity: "warning",
        message: `signature input '${name}' is written to by a propagator — it is not a source`,
      });
    }
  }
  const out = network.signature.to;
  if (readCells.has(out)) {
    getCell(out)._errors.push({
      kind: "non-terminal-output",
      severity: "warning",
      message: `signature output '${out}' is used as input by a propagator — it is not a terminal`,
    });
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
