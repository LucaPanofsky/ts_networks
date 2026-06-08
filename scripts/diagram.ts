import { readFileSync } from "fs";
import { diagram } from "../src/operations/diagram.js";

// Usage: npx tsx scripts/diagram.ts <file.tsn> [networkName] [live]
//   - networkName is optional if the program defines exactly one network.
//   - pass the literal word `live` (in any position after the file) to get a
//     mermaid.live editor link instead of the raw diagram string.
const file = process.argv[2];
const rest = process.argv.slice(3);
const live = rest.includes("live");
const network = rest.find(a => a !== "live");

if (!file) {
  console.error("Usage: npx tsx scripts/diagram.ts <file.tsn> [networkName] [live]");
  process.exit(1);
}

let source: string;
try {
  source = readFileSync(file, "utf-8");
} catch {
  console.error(`Cannot read file: ${file}`);
  process.exit(1);
}

const result = diagram.handle({ source, network, live });
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

console.log(live && result.url ? result.url : result.diagram);
