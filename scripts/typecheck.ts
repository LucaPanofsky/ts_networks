import { readFileSync } from "fs";
import { parseProgram } from "../src/data-network/tree-to-network.js";
import { typeCheckProgram } from "../src/data-network/type-checker.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/typecheck.ts <file.tsn>");
  process.exit(1);
}

const dsl = readFileSync(file, "utf-8");
const program = parseProgram(dsl);
const results = typeCheckProgram(program);

let hasErrors = false;

for (const [networkName, enriched] of results) {
  for (const cell of enriched.cells.values()) {
    for (const err of cell._errors) {
      console.error(`[${networkName}] cell '${cell.name}': [${err.kind}] ${err.message}`);
      hasErrors = true;
    }
  }
  for (const prop of enriched.propagators) {
    for (const err of prop._errors) {
      const label = prop.fn ?? "switch";
      console.error(`[${networkName}] propagator '${label}': [${err.kind}] ${err.message}`);
      hasErrors = true;
    }
  }
}

if (hasErrors) {
  process.exit(1);
} else {
  console.log("ok");
}
