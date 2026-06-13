import { readFileSync } from "fs";
import { join } from "path";
import { pdfToText, joinPages, PdfExtractError } from "../../src/pdf/extract.js";

// cwd-relative (jest runs from the repo root) so this works under both the CJS
// and the ESM jest runner — `__dirname` is undefined under true ESM.
const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join("tests/fixtures/pdf", name)));

// joinPages is the pure page-delimiter formatter — testable with no PDF at all.
describe("joinPages — page-delimiter formatting", () => {
  test("heads every page with a 1-based `--- page N ---` delimiter", () => {
    expect(joinPages(["alpha", "beta"])).toBe(
      "--- page 1 ---\nalpha\n--- page 2 ---\nbeta",
    );
  });

  test("a single page is still labelled page 1", () => {
    expect(joinPages(["only"])).toBe("--- page 1 ---\nonly");
  });

  test("no pages => empty string", () => {
    expect(joinPages([])).toBe("");
  });
});

describe("pdfToText — capabilities", () => {
  test("extracts the text of a single-page PDF", async () => {
    const r = await pdfToText(fixture("single-page.pdf"));
    expect(r.meta.totalPages).toBe(1);
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]).toContain("Hello PDF world");
    expect(r.pages[0]).toContain("single page fixture ALPHA");
  });

  test("returns one entry per page and delimits them, in order, in `text`", async () => {
    const r = await pdfToText(fixture("two-page.pdf"));
    expect(r.meta.totalPages).toBe(2);
    expect(r.pages).toHaveLength(2);
    expect(r.pages[0]).toContain("PAGE ONE marker alpha");
    expect(r.pages[1]).toContain("PAGE TWO marker beta");
    expect(r.text).toContain("--- page 1 ---");
    expect(r.text).toContain("--- page 2 ---");
    expect(r.text.indexOf("--- page 1 ---")).toBeLessThan(r.text.indexOf("--- page 2 ---"));
    expect(r.text.indexOf("PAGE ONE")).toBeLessThan(r.text.indexOf("--- page 2 ---"));
  });
});

describe("pdfToText — negatives & edges", () => {
  test("a blank, text-less page yields empty text rather than crashing", async () => {
    const r = await pdfToText(fixture("blank-page.pdf"));
    expect(r.meta.totalPages).toBe(1);
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]!.trim()).toBe("");
  });

  test("corrupt bytes reject with a typed PdfExtractError", async () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    await expect(pdfToText(garbage)).rejects.toBeInstanceOf(PdfExtractError);
  });
});

// Realistic smoke test: a real-world invoice (not generated). Asserts robust
// substrings, NOT exact text — real PDFs interleave columns by content-stream
// order, which is precisely the layout-loss the design tolerates.
describe("pdfToText — realistic smoke test", () => {
  test("recovers the salient fields of a real invoice", async () => {
    const r = await pdfToText(fixture("example_invoice.pdf"));
    expect(r.meta.totalPages).toBeGreaterThanOrEqual(1);
    for (const token of [
      "Invoice Number",
      "123",
      "Amount Due",
      "$19.00",
      "support@example.com",
    ]) {
      expect(r.text).toContain(token);
    }
  });
});
