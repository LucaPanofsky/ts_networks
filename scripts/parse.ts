import { readFileSync } from "fs";
import { parse } from "../src/operations/parse.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/parse.ts <file.tsn>");
  process.exit(1);
}

const source = readFileSync(file, "utf-8");
const result = parse.handle({ source });

if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

console.log(JSON.stringify(result.ast, null, 2));
