import type { ProgramAST, DataNetworkAST, Term } from "../../data-network/types.js";
import type { ValidationError } from "../types.js";

function propagatorEdges(terms: Term[]): { writers: Set<string>; readers: Set<string> } {
  const writers = new Set<string>();
  const readers = new Set<string>();
  for (const term of terms) {
    if (term.kind === "propagate" || term.kind === "switch") {
      writers.add(term.to);
      for (const cell of term.from) readers.add(cell);
    }
  }
  return { writers, readers };
}

function checkNetworkTopology(network: DataNetworkAST): ValidationError[] {
  const { writers, readers } = propagatorEdges(network.terms);
  const errors: ValidationError[] = [];

  for (const cell of network.signature.from) {
    if (writers.has(cell)) {
      errors.push({
        severity: "warning",
        check:    "topology",
        network:  network.name,
        message:  `signature input "${cell}" is written to by a propagator — it is not a source`,
      });
    }
  }

  if (readers.has(network.signature.to)) {
    errors.push({
      severity: "warning",
      check:    "topology",
      network:  network.name,
      message:  `signature output "${network.signature.to}" is used as input by a propagator — it is not a terminal`,
    });
  }

  return errors;
}

export function checkTopology(program: ProgramAST): ValidationError[] {
  return program.networks.flatMap(checkNetworkTopology);
}
