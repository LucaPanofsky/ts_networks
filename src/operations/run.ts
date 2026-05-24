import { compile } from "../sandbox/jsgen/index.js";
import { Something } from "../info-structure.js";
import type { Operation } from "./types.js";

type RunInput = {
  source: string;
  network: string;
  cells: Record<string, string>;
};

type RunOutput =
  | { ok: true; network: string; cells: Record<string, unknown> }
  | { ok: false; error: string };

export const run: Operation<RunInput, RunOutput> = {
  name: "run",
  description: "Compile and execute a ts-networks network with given cell inputs.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The ts-networks source code." },
      network: { type: "string", description: "Name of the network to run." },
      cells: {
        type: "object",
        description: "Map of cell names to JavaScript expressions for their initial values.",
        additionalProperties: { type: "string" },
      },
    },
    required: ["source", "network", "cells"],
  },
  handle(input) {
    const { source, network: networkName, cells: cellExprs } = input;
    if (!source) return { ok: false, error: "source is required" };
    if (!networkName) return { ok: false, error: "network is required" };

    let compiled;
    try {
      compiled = compile(source);
    } catch (e) {
      return { ok: false, error: `compile error: ${e}` };
    }

    const network = compiled.networks.get(networkName);
    if (!network) return { ok: false, error: `network "${networkName}" not found` };

    const validEntries = Object.entries(compiled.sandbox).filter(([k]) =>
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k)
    );
    const sandboxKeys = validEntries.map(([k]) => k);
    const sandboxVals = validEntries.map(([, v]) => v);
    const inputs: Record<string, unknown> = {};
    for (const [name, expr] of Object.entries(cellExprs)) {
      try {
        inputs[name] = new Function(...sandboxKeys, `return ${expr}`)(...sandboxVals);
      } catch (e) {
        return { ok: false, error: `cannot evaluate cell "${name}": ${e}` };
      }
    }

    let result;
    try {
      result = network.invoke(inputs);
    } catch (e) {
      return { ok: false, error: `runtime error: ${e}` };
    }

    const cells: Record<string, unknown> = {};
    for (const [name, cell] of result.cells) {
      const info = cell.knows();
      cells[name] = info instanceof Something ? info.content() : null;
    }

    return { ok: true, network: networkName, cells };
  },
};
