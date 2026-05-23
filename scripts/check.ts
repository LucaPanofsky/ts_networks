import { readFileSync } from "fs";
import { parseProgram } from "../src/data-network/tree-to-network.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/check.ts <file.dn>");
  process.exit(1);
}

try {
  const dsl = readFileSync(file, "utf-8");
  parseProgram(dsl);
  console.log("ok");
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
