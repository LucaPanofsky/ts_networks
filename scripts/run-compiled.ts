import { readFileSync } from "fs";
import { runCompiled } from "../src/operations/run-compiled.js";

const [, , file, network, ...cellArgs] = process.argv;
if (!file || !network) {
  console.error("Usage: npx tsx scripts/run-compiled.ts <artifact.js> <network> [cell=expr ...]");
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

let code: string;
try {
  code = readFileSync(file, "utf-8");
} catch {
  console.error(`Cannot read file: ${file}`);
  process.exit(1);
}

const result = await runCompiled.handle({ code, network, cells });
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

console.log(`${result.network} = ${result.output === null ? "∅" : JSON.stringify(result.output)}`);
