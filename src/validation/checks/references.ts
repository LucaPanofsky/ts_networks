import type { ProgramAST } from "../../data-network/types.js";
import type { ValidationError } from "../types.js";

function resolvedNames(program: ProgramAST): Set<string> {
  const names = new Set<string>();
  for (const fn of program.fns) {
    names.add(fn.name);
  }
  for (const rec of program.records) {
    names.add(rec.name);
    for (const field of rec.fields) {
      names.add(`${rec.name}.${field.name}`);
    }
  }
  return names;
}

export function checkReferences(program: ProgramAST): ValidationError[] {
  const known = resolvedNames(program);
  const errors: ValidationError[] = [];

  for (const network of program.networks) {
    for (const term of network.terms) {
      if (term.kind === "propagate" && !known.has(term.fn)) {
        errors.push({
          severity: "error",
          check:    "references",
          network:  network.name,
          message:  `unknown function "${term.fn}"`,
        });
      }
    }
  }

  return errors;
}
