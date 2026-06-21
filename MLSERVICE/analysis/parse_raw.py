"""Spike: dump ONLY the model-native parse — no enrichment, no 'reading'.

This answers one question: what does spaCy actually return for a sentence,
before we add a single column of our own? Whatever appears here is the schema
the /parse leaf would expose; everything NOT here is the language's job.

Run:  ../.venv/bin/python parse_raw.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import spacy

# The GDPR example from the README.
SENTENCE = "The controller shall document any personal data breaches without delay."


def token_native(t) -> dict:
    """Every field spaCy gives for one token — verbatim, nothing computed by us."""
    return {
        "i": t.i,                       # position in the doc (the token's id)
        "text": t.text,                 # surface form
        "lemma": t.lemma_,              # dictionary form  ("breaches" -> "breach")
        "pos": t.pos_,                  # coarse part of speech (Universal POS)  "VERB"
        "tag": t.tag_,                  # fine-grained tag (Penn Treebank)        "VBP", "MD"
        "dep": t.dep_,                  # dependency label to its head            "nsubj", "aux"
        "head": t.head.i,               # id of the word this one hangs off  <-- the tree edge
        "children": [c.i for c in t.children],   # ids that hang off this one (derivable from head)
        "morph": t.morph.to_dict(),     # morphological features  {"Tense":"Past", ...}
        "ent_type": t.ent_type_,        # named-entity type if any, else ""
        "ent_iob": t.ent_iob_,          # B/I/O entity position tag
        "is_stop": t.is_stop,           # function word?
        "is_punct": t.is_punct,
    }


def main() -> None:
    nlp = spacy.load("en_core_web_sm")
    doc = nlp(SENTENCE)

    result = {
        "model": nlp.meta["name"],
        "text": SENTENCE,
        # doc-level: sentence spans, entities, noun chunks — all native.
        "sents": [{"start": s.start, "end": s.end, "text": s.text} for s in doc.sents],
        "ents": [
            {"text": e.text, "label": e.label_, "start": e.start, "end": e.end}
            for e in doc.ents
        ],
        "noun_chunks": [
            {"text": c.text, "root": c.root.i, "start": c.start, "end": c.end}
            for c in doc.noun_chunks
        ],
        # token-level: the dependency parse proper.
        "tokens": [token_native(t) for t in doc],
    }

    here = Path(__file__).resolve().parent
    out = here / "parse_raw.json"
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\nWrote -> {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
