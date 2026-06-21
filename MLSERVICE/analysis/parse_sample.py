"""Preliminary analysis — what does the pretrained parser actually return?

This is a *spike*, the seed of the eventual app/parse.py. It does NOT decide anything.
It runs spaCy's dependency parse over resources/sample.txt and, for every modal
auxiliary (shall / may / must / should), surfaces the features that actually
disambiguate its deontic force:

  - the VERB the modal governs (head of the modal token) and its lemma
  - whether that verb is PASSIVE or COPULAR/constitutive (be/deem/consider/bind…)
  - the SUBJECT (nsubj / nsubjpass) — the norm's bearer
  - the OBJECT (dobj / obj / attr) — what is acted on / conferred

The point: "shall" alone is not a modality. "shall communicate" (act → obligation),
"shall have the right" (have → conferral), "shall be deemed" (copular → constitutive)
are different norms that share the word "shall". The governed-verb is the signal, and
the parse exposes it. This script just makes that visible on real text.

Run:  ../.venv/bin/python parse_sample.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import spacy

MODALS = {"shall", "may", "must", "should", "can", "will"}

# Verb lemmas whose presence right after a modal flips the reading away from a plain
# obligation-to-act. Hand-seeded ONLY to annotate the report (not a production rule) —
# the whole point of the spike is to see whether these are the right buckets.
COPULAR = {"be", "become", "remain"}
CONSTITUTIVE = {"deem", "consider", "bind", "mean", "constitute", "apply"}
CONFERRAL = {"have"}


def load() -> "spacy.language.Language":
    return spacy.load("en_core_web_sm")


def provisions(text: str) -> list[str]:
    """Split on blank lines: each paragraph is one provision (keeps colon-lists whole)."""
    blocks, cur = [], []
    for line in text.splitlines():
        if line.strip() == "":
            if cur:
                blocks.append(" ".join(cur).strip())
                cur = []
        else:
            cur.append(line.strip())
    if cur:
        blocks.append(" ".join(cur).strip())
    return blocks


def subj_of(verb) -> str:
    for c in verb.children:
        if c.dep_ in ("nsubj", "nsubjpass"):
            return " ".join(t.text for t in c.subtree)
    return "—"


def obj_of(verb) -> str:
    parts = []
    for c in verb.children:
        if c.dep_ in ("dobj", "obj", "attr", "dative"):
            parts.append(" ".join(t.text for t in c.subtree))
    return " | ".join(parts) if parts else "—"


def is_passive(verb) -> bool:
    return any(c.dep_ in ("auxpass", "nsubjpass") for c in verb.children)


def reading(verb) -> str:
    """A *guess label* for the report, derived only from the governed verb."""
    lemma = verb.lemma_.lower()
    if is_passive(verb):
        return "PASSIVE (agent demoted) → obligation-on-others / constitutive?"
    if lemma in CONFERRAL:
        return "CONFERRAL (right/power granted) → permission-flavored"
    if lemma in COPULAR or lemma in CONSTITUTIVE:
        return f"COPULAR/CONSTITUTIVE ('{lemma}') → defines a state, not an act"
    return "ACT → obligation-to-do"


def truncate(s: str, n: int = 70) -> str:
    s = s.replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def modal_record(m) -> dict:
    """The extracted features for one modal — the shape the rules would consume."""
    verb = m.head  # the verb the modal governs
    return {
        "modal": m.text,
        "governs": {"text": verb.text, "lemma": verb.lemma_, "tag": verb.tag_},
        "subject": subj_of(verb),
        "object": obj_of(verb),
        "passive": is_passive(verb),
        "reading": reading(verb),
    }


def token_row(t) -> dict:
    """One token of the raw dependency parse — 'what the parser returns', verbatim."""
    return {
        "text": t.text,
        "lemma": t.lemma_,
        "pos": t.pos_,
        "tag": t.tag_,
        "dep": t.dep_,
        "head": t.head.text,
    }


def analyze(nlp, provs: list[str]) -> dict:
    """Build the full structured result for JSON — one tree per provision."""
    out_provs = []
    for pi, prov in enumerate(provs, 1):
        doc = nlp(prov)
        sentences = []
        for si, sent in enumerate(doc.sents, 1):
            modals = [t for t in sent if t.lemma_.lower() in MODALS and t.tag_ == "MD"]
            sentences.append({
                "index": si,
                "text": sent.text.strip(),
                "modals": [modal_record(m) for m in modals],
                "tokens": [token_row(t) for t in sent],  # the raw parse
            })
        out_provs.append({
            "index": pi,
            "text": prov,
            "entities": [{"text": e.text, "label": e.label_} for e in doc.ents],
            "sentences": sentences,
        })
    return {"model": nlp.meta["name"], "provisions": out_provs}


def print_summary(result: dict) -> None:
    for prov in result["provisions"]:
        print("\n" + "=" * 96)
        print(f"PROVISION {prov['index']}: {truncate(prov['text'], 88)}")
        print("=" * 96)
        any_modal = False
        for sent in prov["sentences"]:
            for mr in sent["modals"]:
                any_modal = True
                g = mr["governs"]
                print(f"\n  [sent {sent['index']}] modal '{mr['modal']}'  →  governs "
                      f"'{g['text']}' (lemma={g['lemma']}, tag={g['tag']})")
                print(f"      subject : {truncate(mr['subject'])}")
                print(f"      object  : {truncate(mr['object'])}")
                print(f"      passive : {mr['passive']}")
                print(f"      reading : {mr['reading']}")
        if not any_modal:
            print("  (no MD modal found in this provision)")


def main() -> None:
    here = Path(__file__).resolve().parent
    sample = here.parent / "resources" / "sample.txt"
    nlp = load()

    result = analyze(nlp, provisions(sample.read_text()))
    print_summary(result)

    out = here / "results.json"
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\n\nWrote structured result → {out}")


if __name__ == "__main__":
    sys.exit(main())
