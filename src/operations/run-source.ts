// Compile-and-run a `.tsn` source file in ONE step, under plain `node` against the built runtime.
//
//     npm run build
//     node dist/operations/run-source.js <file.tsn> <network> [name=expr | name=@file ...]
//     # or: npm run run-tsn -- <file.tsn> <network> [...]
//
// Same result as `scripts/run.ts`, but that script is TypeScript run via `tsx`; this is the BUILT
// entry you invoke with `node`. It compiles in memory (`run` = emitJs → loadProgram →
// runNetworkOnLoaded), so there is no `.mjs` artifact, no temp file, and no `@tsn/runtime`
// resolution to worry about — `loadProgram` injects the live (dist) runtime. The guarded `main`
// fires only when this module is the program entry, never when imported.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { run } from "./run.js";

async function main(): Promise<void> {
  const [, , file, network, ...cellArgs] = process.argv;
  if (!file || !network) {
    console.error("Usage: node dist/operations/run-source.js <file.tsn> <network> [name=expr | name=@file ...]");
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

  let source: string;
  try {
    source = readFileSync(file, "utf-8");
  } catch {
    console.error(`Cannot read file: ${file}`);
    process.exit(1);
  }

  const result = await run.handle({ source, network, cells });
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  for (const [name, value] of Object.entries(result.cells)) {
    console.log(`${name} = ${value === null ? "∅" : JSON.stringify(value)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
