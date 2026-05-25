import { readFileSync } from "fs";
import { check } from "../src/operations/check.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/check.ts <file.tsn>");
  process.exit(1);
}

let source: string;
try {
  source = readFileSync(file, "utf-8");
} catch {
  console.error(`Cannot read file: ${file}`);
  process.exit(1);
}
const result = check.handle({ source });
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
console.log("ok");
