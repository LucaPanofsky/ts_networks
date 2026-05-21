import type { ProgramAST } from "../../data-network/types.js";
import type { ValidationError } from "../types.js";

const MAX_ARITY = 5;

function arityMap(program: ProgramAST): Map<string, number> {
  const map = new Map<string, number>();
  for (const fn of program.fns) {
    map.set(fn.name, fn.params.length);
  }
  for (const rec of program.records) {
    map.set(rec.name, rec.fields.length);
    for (const field of rec.fields) {
      map.set(`${rec.name}.${field.name}`, 1);
    }
  }
  return map;
}

export function checkArities(program: ProgramAST): ValidationError[] {
  const known = arityMap(program);
  const errors: ValidationError[] = [];

  for (const network of program.networks) {
    for (const term of network.terms) {
      if (term.kind !== "propagate") continue;

      const actual = term.from.length;

      if (actual > MAX_ARITY) {
        errors.push({
          severity: "error",
          check:    "arities",
          network:  network.name,
          message:  `"${term.fn}" is called with ${actual} inputs but the maximum supported arity is ${MAX_ARITY}`,
        });
        continue;
      }

      const expected = known.get(term.fn);
      if (expected !== undefined && actual !== expected) {
        errors.push({
          severity: "error",
          check:    "arities",
          network:  network.name,
          message:  `"${term.fn}" expects ${expected} input(s) but is called with ${actual}`,
        });
      }
    }
  }

  return errors;
}
