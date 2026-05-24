import { readFileSync } from "fs";
import { run } from "../src/operations/run.js";

const [, , file, network, ...cellArgs] = process.argv;
if (!file || !network) {
  console.error("Usage: npx tsx scripts/run.ts <file.tsn> <network> [cell=expr ...]");
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

const source = readFileSync(file, "utf-8");
const result = run.handle({ source, network, cells });

if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

for (const [name, value] of Object.entries(result.cells)) {
  console.log(`${name} = ${value === null ? "∅" : JSON.stringify(value)}`);
}
