import { pdfToText } from "../src/operations/pdf-to-text.js";

// Usage: npx tsx scripts/pdf.ts <file.pdf>
//   Extract text from a PDF in the WORKSPACE directory and write <file>.txt
//   alongside it. Set TSN_WORKSPACE to point at a different workspace root.
const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/pdf.ts <file.pdf>");
  process.exit(1);
}

const result = await pdfToText.handle({ file });
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

console.log(`wrote ${result.output} (${result.pages} page${result.pages === 1 ? "" : "s"})`);
console.log("--- preview ---");
console.log(result.preview);
