import { Workspace, WorkspaceError, workspaceRoot } from "../fs/workspace.js";
import { pdfToText as decodePdf, PdfExtractError } from "../pdf/extract.js";
import type { Operation } from "./types.js";

// The agent's PDF→text tool: read a PDF from the workspace, decode it (Phase 1
// core), and write the extracted text back to <name>.txt in the same workspace.
// The workspace is the impure boundary; the decode core is pure. This operation
// auto-surfaces to the MCP server and CLI via the `operations` array.

const PREVIEW_CHARS = 500;

// Derive the .txt output name from a PDF input name: drop a trailing `.pdf`
// (any case), append `.txt`. "invoice.pdf" -> "invoice.txt"; "scan" -> "scan.txt".
export function txtNameFor(pdfName: string): string {
  return pdfName.replace(/\.pdf$/i, "") + ".txt";
}

export type PdfToTextInput = { file: string };
export type PdfToTextOutput =
  | { ok: true; output: string; pages: number; preview: string }
  | { ok: false; error: string };

// Core, testable against an injected workspace: read -> decode -> write -> preview.
// Expected failures (missing file, bad name, undecodable PDF) come back as
// `{ ok: false }`; nothing is thrown for those.
export async function extractToWorkspace(ws: Workspace, file: string): Promise<PdfToTextOutput> {
  let bytes: Uint8Array;
  try {
    bytes = await ws.readBytes(file);
  } catch (e) {
    if (e instanceof WorkspaceError) return { ok: false, error: e.message };
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, error: `no such file in the workspace: ${file}` };
    }
    return { ok: false, error: (e as Error).message };
  }

  let text: string;
  let pages: number;
  try {
    const decoded = await decodePdf(bytes);
    text = decoded.text;
    pages = decoded.meta.totalPages;
  } catch (e) {
    if (e instanceof PdfExtractError) {
      return { ok: false, error: `could not extract text from ${file}: ${e.message}` };
    }
    return { ok: false, error: (e as Error).message };
  }

  const output = txtNameFor(file);
  try {
    await ws.writeText(output, text);
  } catch (e) {
    if (e instanceof WorkspaceError) return { ok: false, error: e.message };
    return { ok: false, error: (e as Error).message };
  }

  return { ok: true, output, pages, preview: text.slice(0, PREVIEW_CHARS) };
}

export const pdfToText: Operation<PdfToTextInput, Promise<PdfToTextOutput>> = {
  name: "pdf-to-text",
  description:
    "Extract text from a PDF in the workspace. Reads <file> (e.g. invoice.pdf), writes the " +
    "extracted text to <file>.txt in the same workspace (pages separated by `--- page N ---`), " +
    "and returns the output filename, page count, and a preview. Layout (columns/tables) is not " +
    "preserved — read the rendered PDF to recover structure.",
  inputSchema: {
    type: "object",
    properties: {
      file: { type: "string", description: "Filename of a PDF in the workspace, e.g. invoice.pdf" },
    },
    required: ["file"],
  },
  handle(input) {
    return extractToWorkspace(new Workspace(workspaceRoot()), input.file);
  },
};
