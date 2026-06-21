// The plain-`node` artifact runner — the "run anywhere" CLI half of compile-once/run-anywhere.
//
// Given a BUILT `.js`/`.mjs` artifact (from `compile-js`), real-`import()` it and run one of its
// networks, seeding cells exactly like the engine `run` / `scripts/run.ts`. Unlike the in-process
// `run-compiled` (which injects the live runtime via `loadProgram`, no build needed), this loads
// the artifact as a true ESM module whose `import * as rt from "@tsn/runtime"` resolves to the
// BUILT runtime under dist/. It therefore MUST run in that same world:
//
//     npm run build
//     node dist/operations/run-artifact.js <artifact.mjs> <network> [name=expr | name=@file ...]
//
// Run it through `tsx` instead and the runner would use the src/ runtime while the artifact uses
// the dist/ one — two class identities — and every cell would fail its `instanceof` and project to
// null. So the entry is a guarded `main` that fires only under plain `node` on the built file.

import { pathToFileURL } from "node:url";
import * as path from "node:path";
import { loadArtifactFromPath } from "../language/runtime/load.js";
import { runNetworkOnLoaded, type RunNetworkOutput } from "./run-network.js";

// Load a built artifact from a path and run one of its networks. The reusable core a host
// (CLI, test, future caller) drives; `absPath` is resolved against cwd if relative.
export async function runArtifactFile(
  artifactPath: string,
  network: string,
  cells: Record<string, string>,
): Promise<RunNetworkOutput> {
  const absPath = path.resolve(process.cwd(), artifactPath);
  let loaded;
  try {
    loaded = await loadArtifactFromPath(absPath);
  } catch (e) {
    return { ok: false, error: `load error: ${(e as Error).message ?? e}` };
  }
  return runNetworkOnLoaded(loaded, network, cells);
}

async function main(): Promise<void> {
  const [, , file, network, ...cellArgs] = process.argv;
  if (!file || !network) {
    console.error("Usage: node dist/operations/run-artifact.js <artifact.mjs> <network> [name=expr | name=@file ...]");
    process.exit(1);
  }

  const cells: Record<string, string> = {};
  for (const arg of cellArgs) {
    const eq = arg.indexOf("=");
    if (eq === -1) {
      console.error(`Invalid cell argument (expected name=expr): ${arg}`);
      process.exit(1);
    }
    cells[arg.slice(0, eq)] = arg.slice(eq + 1);
  }

  const result = await runArtifactFile(file, network, cells);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  for (const [name, value] of Object.entries(result.cells)) {
    console.log(`${name} = ${value === null ? "∅" : JSON.stringify(value)}`);
  }
}

// Fire `main` only when this module is the program entry under plain `node` — never when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
