#!/usr/bin/env python3
"""Regenerate the deterministic PDF fixtures used by tests/pdf/extract.test.ts.

These are tiny PDFs with KNOWN text so the extractor's unit tests can assert
exact output. Committed alongside the generated .pdf files for provenance — CI
does not run this (Node only); re-run locally with `python3 generate.py` after
changing fixture content. Requires reportlab (`pip install reportlab`).

`example_invoice.pdf` is NOT generated here — it is a real-world sample PDF
(public GoRails example invoice) used for the realistic smoke test.
"""
import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

OUT = os.path.dirname(os.path.abspath(__file__))


def make(name: str, pages: list[list[str]]) -> None:
    c = canvas.Canvas(os.path.join(OUT, name), pagesize=letter)
    for lines in pages:
        y = 750
        for line in lines:
            c.drawString(72, y, line)
            y -= 20
        c.showPage()  # ends the page (an empty `lines` => a blank page)
    c.save()


make("single-page.pdf", [["Hello PDF world", "single page fixture ALPHA"]])
make("two-page.pdf", [["PAGE ONE marker alpha"], ["PAGE TWO marker beta"]])
make("blank-page.pdf", [[]])  # one page, no text — the empty-not-crash case
print("wrote single-page.pdf, two-page.pdf, blank-page.pdf to", OUT)
