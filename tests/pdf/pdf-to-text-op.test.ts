import { mkdtemp, rm, copyFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Workspace } from "../../src/fs/workspace.js";
import {
  extractToWorkspace,
  txtNameFor,
  pdfToText,
} from "../../src/operations/pdf-to-text.js";

const FIX = "tests/fixtures/pdf";

describe("txtNameFor — output naming", () => {
  test.each([
    ["invoice.pdf", "invoice.txt"],
    ["scan.PDF", "scan.txt"],
    ["noext", "noext.txt"],
    ["a.pdf.pdf", "a.pdf.txt"],
  ])("%s -> %s", (input, expected) => {
    expect(txtNameFor(input)).toBe(expected);
  });
});

describe("extractToWorkspace — read PDF, write .txt", () => {
  let root: string;
  let ws: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "pdfop-"));
    ws = new Workspace(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("extracts a single-page PDF and writes the delimited .txt back", async () => {
    await copyFile(join(FIX, "single-page.pdf"), join(root, "doc.pdf"));
    const r = await extractToWorkspace(ws, "doc.pdf");
    expect(r).toMatchObject({ ok: true, output: "doc.txt", pages: 1 });
    if (!r.ok) throw new Error("expected ok");

    // the .txt landed in the workspace, with the page delimiter and the text
    const written = await ws.readText("doc.txt");
    expect(written).toContain("--- page 1 ---");
    expect(written).toContain("Hello PDF world");
    // preview is the head of the written text, capped at 500 chars
    expect(written.startsWith(r.preview)).toBe(true);
    expect(r.preview.length).toBeLessThanOrEqual(500);
  });

  test("a two-page PDF reports 2 pages and delimits both", async () => {
    await copyFile(join(FIX, "two-page.pdf"), join(root, "multi.pdf"));
    const r = await extractToWorkspace(ws, "multi.pdf");
    expect(r).toMatchObject({ ok: true, output: "multi.txt", pages: 2 });
    const written = await ws.readText("multi.txt");
    expect(written).toContain("--- page 1 ---");
    expect(written).toContain("--- page 2 ---");
  });

  test("a missing file fails as a value, not a throw", async () => {
    const r = await extractToWorkspace(ws, "nope.pdf");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.error).toMatch(/no such file/i);
  });

  test("a non-PDF file fails to decode and writes no .txt", async () => {
    await writeFile(join(root, "fake.pdf"), "this is not a pdf", "utf-8");
    const r = await extractToWorkspace(ws, "fake.pdf");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.error).toMatch(/could not extract/i);
    expect(await ws.exists("fake.txt")).toBe(false);
  });

  test("a traversal filename is refused", async () => {
    const r = await extractToWorkspace(ws, "../escape.pdf");
    expect(r.ok).toBe(false);
  });
});

describe("pdfToText operation — handle wires the default workspace via TSN_WORKSPACE", () => {
  let root: string;
  const saved = process.env.TSN_WORKSPACE;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "pdfop-env-"));
    process.env.TSN_WORKSPACE = root;
  });
  afterEach(async () => {
    if (saved === undefined) delete process.env.TSN_WORKSPACE;
    else process.env.TSN_WORKSPACE = saved;
    await rm(root, { recursive: true, force: true });
  });

  test("handle({file}) extracts from the configured workspace", async () => {
    await copyFile(join(FIX, "single-page.pdf"), join(root, "in.pdf"));
    const r = await pdfToText.handle({ file: "in.pdf" });
    expect(r).toMatchObject({ ok: true, output: "in.txt", pages: 1 });
    expect(r.ok && r.preview).toContain("Hello PDF world");
  });
});
