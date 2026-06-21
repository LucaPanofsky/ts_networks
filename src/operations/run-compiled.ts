import { loadProgram } from "../language/runtime/load.js";
import { runNetworkOnLoaded, type RunNetworkOutput } from "./run-network.js";
import type { Operation } from "./types.js";

// The "run anywhere" half (in-process variant): load a compiled ts-networks artifact (from
// `compile-js`) by injecting the live runtime into its module body — `loadProgram` — and run one
// of its networks, seeding its cells. This mirrors the engine `run` operation against the modular
// artifact instead of an in-memory compile: the proof that a program compiled once to a .js file
// runs separately and produces the same result. The output shape matches `run` exactly.
//
// The actual run (tool injection, cell seeding, network invocation, projection) is the shared
// `runNetworkOnLoaded` core — the SAME tail the plain-`node` `run-artifact` path uses; the only
// difference is how the artifact is loaded. Cell seeding mirrors `run`: a value is `@filename`
// (read verbatim from the workspace) or a JS expression evaluated with the program's value
// bindings in scope; inputs are seeded BY NAME (any cell, not just signature inputs).

type RunCompiledInput = { code: string; network: string; cells: Record<string, string> };
type RunCompiledOutput = RunNetworkOutput;

export const runCompiled: Operation<RunCompiledInput, Promise<RunCompiledOutput>> = {
  name: "run-compiled",
  description:
    "Run a network in a compiled ts-networks JavaScript artifact (in-process), seeding its input cells.",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "The compiled JavaScript artifact (from compile-js)." },
      network: { type: "string", description: "Name of the network to run." },
      cells: {
        type: "object",
        description:
          "Map of cell names to values (any cell, seeded by name). Each value is a JavaScript " +
          "expression — literals/JSON or a call to one of the program's own fns / record " +
          "constructors — or `@filename` to seed the raw text of a workspace file (read verbatim).",
        additionalProperties: { type: "string" },
      },
    },
    required: ["code", "network", "cells"],
  },
  async handle(input) {
    const { code, network: networkName, cells: cellExprs } = input;
    if (!code) return { ok: false, error: "code is required" };
    if (!networkName) return { ok: false, error: "network is required" };

    let loaded;
    try {
      loaded = loadProgram(code);
    } catch (e) {
      return { ok: false, error: `load error: ${e}` };
    }

    return runNetworkOnLoaded(loaded, networkName, cellExprs);
  },
};
