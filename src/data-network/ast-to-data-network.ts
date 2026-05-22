import type { DataNetworkAST } from "./types.js";
import { DataNetwork } from "./data-network.js";

function coerce(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export function astToDataNetwork(ast: DataNetworkAST): DataNetwork {
  const net = new DataNetwork(ast.name, ast.signature);

  for (const term of ast.terms) {
    if (term.kind === "cell") {
      const v = coerce(term.value);
      net.addCell(term.name, { content: v, defaultContent: v });
    } else if (term.kind === "constant") {
      const v = coerce(term.value);
      net.addCell(term.name, { content: v, defaultContent: v, isConstant: true });
    } else if (term.kind === "propagate") {
      net.addPropagator(term.fn, term.from, term.to, term.params);
    } else if (term.kind === "switch") {
      net.addPropagator("__SWITCH", term.from, term.to, { predicate: term.fn ?? "true?" });
    }
  }

  return net;
}
