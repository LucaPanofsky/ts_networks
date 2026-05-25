import { readFileSync } from "fs";
import { compileSchemas } from "../src/operations/compile-schemas.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/compile-schemas.ts <file.tsn>");
  process.exit(1);
}

let source: string;
try {
  source = readFileSync(file, "utf-8");
} catch {
  console.error(`Cannot read file: ${file}`);
  process.exit(1);
}
const result = compileSchemas.handle({ source });

if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

console.log(JSON.stringify(result.schemas, null, 2));
