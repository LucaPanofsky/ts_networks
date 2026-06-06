import { compile } from "../sandbox/jsgen/index.js";
import { toolsFromConfig } from "./tools.js";
import { Something, Contradiction, type InfoStructure } from "../info-structure.js";
import { MergeObject } from "../information-structures/merge-object.js";
import { MergeSet } from "../information-structures/merge-set.js";
import { APromise } from "../information-structures/apromise.js";
import type { Operation } from "./types.js";

type RunInput = {
  source: string;
  network: string;
  cells: Record<string, string>;
};

type RunOutput =
  | { ok: true; network: string; cells: Record<string, unknown> }
  | { ok: false; error: string };

export const run: Operation<RunInput, Promise<RunOutput>> = {
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
  async handle(input) {
    const { source, network: networkName, cells: cellExprs } = input;
    if (!source) return { ok: false, error: "source is required" };
    if (!networkName) return { ok: false, error: "network is required" };

    let compiled;
    try {
      // Inject the full program-reasoning resolver: an executed llmfn's `with: tools`
      // can reach every operation (run-grammar, typecheck, run, …), not just `parse`.
      compiled = compile(source, toolsFromConfig);
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

    // Drive the ASYNC runtime: async leaves (llmfn) return an APromise that the sync
    // runner would never await, leaving the cell as an unresolved promise (shown as
    // `∅`). invokeAsync awaits them; it is also correct for purely synchronous
    // networks (sync propagators are wrapped), so this is the single run path.
    let result;
    try {
      result = await network.invokeAsync(inputs);
    } catch (e) {
      return { ok: false, error: `runtime error: ${e}` };
    }

    const cells: Record<string, unknown> = {};
    for (const [name, cell] of result.cells) {
      // A terminal async leaf (llmfn) leaves its cell holding an unresolved APromise
      // that no downstream propagator forced — await it here so the result is the
      // real value, not `∅`.
      let info = cell.knows();
      if (info instanceof APromise) info = (await info.deferred.promise) as InfoStructure<unknown>;
      // Surface failures instead of hiding them as `∅`: a Contradiction carries the
      // reason that caused it (e.g. an API error or a parse failure).
      if (info instanceof Contradiction) {
        cells[name] = { __contradiction: info.type, reason: String(info.reason ?? "") };
        continue;
      }
      cells[name] =
        info instanceof Something || info instanceof MergeObject || info instanceof MergeSet
          ? info.content()
          : null;
    }

    return { ok: true, network: networkName, cells };
  },
};
