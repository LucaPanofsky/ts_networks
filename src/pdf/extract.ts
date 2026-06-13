import { extractText } from "unpdf";

// The result of decoding a PDF into text. `pages` is the raw per-page text in
// content-stream order (unpdf/pdf.js); `text` is those pages joined with a
// `--- page N ---` delimiter so a reader can align page N of the rendered PDF
// to its text region. Layout (columns, tables) is NOT preserved — that loss is
// intentional and recovered, at authoring time, by reading the rendered PDF.
export interface PdfText {
  pages: string[];
  text: string;
  meta: { totalPages: number };
}

// A PDF that could not be decoded (not a PDF, empty, or corrupt). Thrown rather
// than returned so the impure boundary (the operation) translates it into its
// `{ ok: false, error }` shape; the pure core stays a plain function.
export class PdfExtractError extends Error {
  override name = "PdfExtractError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

// Head each per-page string with a 1-based `--- page N ---` delimiter and join.
// Pure and total: `[]` -> "". This is the page-boundary contract the agent
// relies on to align the image to the text, kept separate so it is testable
// without a PDF.
export function joinPages(pages: string[]): string {
  return pages.map((page, i) => `--- page ${i + 1} ---\n${page}`).join("\n");
}

// Decode PDF bytes to text. Consumes `bytes` (pdf.js may detach the buffer).
// Throws PdfExtractError on any decode failure.
export async function pdfToText(bytes: Uint8Array): Promise<PdfText> {
  let extracted: { totalPages: number; text: string[] };
  try {
    extracted = await extractText(bytes, { mergePages: false });
  } catch (err) {
    throw new PdfExtractError("failed to decode PDF", { cause: err });
  }
  const pages = extracted.text;
  return { pages, text: joinPages(pages), meta: { totalPages: extracted.totalPages } };
}
