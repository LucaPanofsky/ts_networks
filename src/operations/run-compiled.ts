import { loadProgram } from "../language/runtime/load.js";
import type { NetworkImpl } from "../language/runtime/index.js";
import { Workspace, WorkspaceError, workspaceRoot } from "../fs/workspace.js";
import { projectInfo } from "./project.js";
import type { Operation } from "./types.js";

// The "run anywhere" half: load a compiled ts-networks artifact (from `compile-js`) and run
// one of its networks in-process, seeding its cells. This mirrors the engine `run` operation
// against the modular artifact instead of an in-memory compile — the proof that a program
// compiled once to a .js file runs separately and produces the same result. The output shape
// matches `run` exactly: every cell, projected through the shared `projectInfo`.
//
// Cell seeding mirrors `run`: a value is `@filename` (read verbatim from the workspace) or a
// JS expression evaluated with the program's value bindings (fns / record constructors) in
// scope. Inputs are seeded BY NAME — any cell, not just the network's signature inputs.

type RunCompiledInput = { code: string; network: string; cells: Record<string, string> };
type RunCompiledOutput =
  | { ok: true; network: string; cells: Record<string, unknown> }
  | { ok: false; error: string };

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
          "Map of input cell names to values. Each value is a JavaScript literal/JSON expression, " +
          "or `@filename` to seed the raw text of a workspace file (read verbatim, not evaluated).",
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

    const sig = loaded.manifest.networks[networkName];
    if (!sig) return { ok: false, error: `network "${networkName}" not found in the artifact` };

    const ws = new Workspace(workspaceRoot());
    const inputs: Record<string, unknown> = {};
    for (const [name, expr] of Object.entries(cellExprs)) {
      // `@filename` seeds the RAW TEXT of a workspace file — read verbatim, never evaluated.
      if (expr.startsWith("@")) {
        const fileName = expr.slice(1);
        try {
          inputs[name] = await ws.readText(fileName);
        } catch (e) {
          if (e instanceof WorkspaceError) return { ok: false, error: `cell "${name}": ${e.message}` };
          if ((e as NodeJS.ErrnoException).code === "ENOENT") {
            return { ok: false, error: `cell "${name}": no such file in the workspace: ${fileName}` };
          }
          return { ok: false, error: `cell "${name}": ${(e as Error).message}` };
        }
        continue;
      }
      try {
        inputs[name] = new Function(`return ${expr}`)();
      } catch (e) {
        return { ok: false, error: `cannot evaluate cell "${name}": ${e}` };
      }
    }

    // Reach the network leaf's all-cells accessor through the backing entry — `resolve()`
    // returns a thunk that would drop the function's attached `cells`. Seed BY NAME (the
    // accessor passes the map straight to the runtime, so any cell can be seeded) and project
    // every cell through the shared `projectInfo`, exactly as `run` does.
    const entry = loaded.registry.backing.get(`network/${networkName}`);
    if (!entry) return { ok: false, error: `network "${networkName}" not found in the artifact` };

    const cells: Record<string, unknown> = {};
    try {
      const leaf = entry.impl as NetworkImpl;
      const raw = await leaf.cells(inputs);
      for (const [name, info] of raw) cells[name] = await projectInfo(info);
    } catch (e) {
      return { ok: false, error: `runtime error: ${e}` };
    }

    return { ok: true, network: networkName, cells };
  },
};
