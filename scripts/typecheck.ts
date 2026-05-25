import { readFileSync } from "fs";
import { typecheck } from "../src/operations/typecheck.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/typecheck.ts <file.tsn>");
  process.exit(1);
}

let source: string;
try {
  source = readFileSync(file, "utf-8");
} catch {
  console.error(`Cannot read file: ${file}`);
  process.exit(1);
}
const result = typecheck.handle({ source });
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

let hasErrors = false;
for (const net of result.networks) {
  for (const [cellName, cell] of Object.entries(net.cells)) {
    for (const err of cell.errors) {
      console.error(`[${net.name}] cell '${cellName}': [${err.kind}] ${err.message}`);
      hasErrors = true;
    }
  }
  for (const prop of net.propagators) {
    for (const err of prop.errors) {
      const label = prop.fn ?? "switch";
      console.error(`[${net.name}] propagator '${label}': [${err.kind}] ${err.message}`);
      hasErrors = true;
    }
  }
}

if (hasErrors) process.exit(1);
else console.log("ok");
