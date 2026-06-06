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
const report = (where: string, err: { kind: string; message: string; severity: "error" | "warning" }) => {
  const tag = err.severity === "warning" ? "warning" : "error";
  console.error(`[${tag}] ${where}: [${err.kind}] ${err.message}`);
  if (err.severity !== "warning") hasErrors = true;
};
for (const net of result.networks) {
  for (const [cellName, cell] of Object.entries(net.cells)) {
    for (const err of cell.errors) report(`[${net.name}] cell '${cellName}'`, err);
  }
  for (const prop of net.propagators) {
    for (const err of prop.errors) report(`[${net.name}] propagator '${prop.fn ?? "switch"}'`, err);
  }
}

if (hasErrors) process.exit(1);
else console.log("ok");
