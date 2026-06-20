import { readFileSync, writeFileSync } from "fs";
import { compileJs } from "../src/operations/compile-js.js";

const [, , file, out] = process.argv;
if (!file) {
  console.error("Usage: npx tsx scripts/compile-js.ts <file.tsn> [out.js]");
  process.exit(1);
}

let source: string;
try {
  source = readFileSync(file, "utf-8");
} catch {
  console.error(`Cannot read file: ${file}`);
  process.exit(1);
}

const result = compileJs.handle({ source });
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

if (out) {
  writeFileSync(out, result.code);
  console.error(`wrote ${out} (networks: ${Object.keys(result.networks).join(", ") || "none"})`);
} else {
  process.stdout.write(result.code);
}
