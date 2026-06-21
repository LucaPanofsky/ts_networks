// The shared execution core for running a network out of a LOADED artifact — the common tail
// of both run paths. An artifact can be loaded two ways: in-process (`loadProgram`, which strips
// the module syntax and injects the live runtime) or via a real `import()` of a built `.js`
// (`loadArtifactFromPath`). Both produce a `LoadedProgram`; from there the steps are identical,
// so they live here once: inject the program-reasoning tools, rebuild the value sandbox, seed
// cells, run the network's all-cells accessor, and project every cell.
//
// Cell seeding mirrors the engine `run`: a value is `@filename` (read verbatim from the
// workspace) or a JS expression evaluated with the program's value bindings (fns / record
// constructors) in scope. Inputs are seeded BY NAME — any cell, not just signature inputs.

import type { LoadedProgram } from "../language/runtime/load.js";
import type { NetworkImpl } from "../language/runtime/index.js";
import { Workspace, WorkspaceError, workspaceRoot } from "../fs/workspace.js";
import { projectInfo } from "./project.js";
import { toolsFromConfig } from "./tools.js";

export type RunNetworkOutput =
  | { ok: true; network: string; cells: Record<string, unknown> }
  | { ok: false; error: string };

export async function runNetworkOnLoaded(
  loaded: LoadedProgram,
  networkName: string,
  cellExprs: Record<string, string>,
): Promise<RunNetworkOutput> {
  if (!networkName) return { ok: false, error: "network is required" };

  // Inject the full program-reasoning resolver — so an artifact's llmfn `with: tools`
  // reaches every operation (run-grammar, typecheck, run, …), matching the engine `run`
  // (run.ts compiles with this same resolver). Late-bound in the runtime, so setting it
  // here — before any network runs — is in time.
  loaded.registry.toolResolver = toolsFromConfig;

  const sig = loaded.manifest.networks[networkName];
  if (!sig) return { ok: false, error: `network "${networkName}" not found in the artifact` };

  // Rebuild the program's value scope from the manifest, so a cell expression can call the
  // program's own fns / record constructors (`cell=myFn(3)`) — mirroring the engine `run`,
  // which evaluates cell exprs against its sandbox. Each name resolves late through the
  // registry, so emit order is irrelevant.
  const ws = new Workspace(workspaceRoot());
  const sandboxKeys = (loaded.manifest.values ?? []).filter((k) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k));
  const sandboxVals = sandboxKeys.map((k) => loaded.registry.resolve(k));
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
      inputs[name] = new Function(...sandboxKeys, `return ${expr}`)(...sandboxVals);
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
}
