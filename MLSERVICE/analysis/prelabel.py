"""Pass-2 pre-fill: draft a ProvisionLabels vector for every training sentence.

QUICK & DIRTY (exploration). Reads resources/training/*.txt, splits each file
into blank-line-separated provisions, and applies LEXICAL RULES to draft a
label vector per sentence. Writes resources/training/labels.jsonl (the single
source of truth for the labels) and prints a distribution summary.

  folder  →  primary group  →  candidate normType values
  ------     -------------     --------------------------
  CONSTITUTIVE   C   definition | scope | reference
  DEONTIC        A   obligation | prohibition | permission
  OBLIGATIONS    A   obligation | prohibition | permission
  POTESTATIVE    B   right | power | liability
  QUALIFIERS     D   (normType detected from the embedded clause)

THE OUTPUT IS A DRAFT, NOT GROUND TRUTH. The rules get the easy ~80% right; the
dataset only becomes worth more than the rules once a human (Pass 3) corrects
the rest — especially right-vs-permission, power-vs-obligation,
scope-vs-definition, and the exemption boundary. Train on the raw rule output
and you just relearn the keyword list (the leakage trap, see README).

Run (from analysis/):  ../.venv/bin/python prelabel.py
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

# filename stem -> primary group (model.md A/B/C/D)
GROUP = {
    "CONSTITUTIVE": "C",
    "DEONTIC": "A",
    "OBLIGATIONS": "A",
    "POTESTATIVE": "B",
    "QUALIFIERS": "D",
}


def has(pattern: str, text: str) -> bool:
    return re.search(pattern, text, re.I) is not None


def any_of(patterns: list[str], text: str) -> bool:
    return any(has(p, text) for p in patterns)


# ── normType: folder constrains the candidate set; cues pick within it ──────────
# constitutive = establishes a legal STATE (10th normType). Strong cues fire in any
# group; soft cues ("considered/remain") only inside the constitutive-leaning C and D.
CONSTITUTIVE_STRONG = r"\bdeemed\b|\bshall constitute\b|\bregarded as\b|\bshall be treated as\b"
CONSTITUTIVE_SOFT = r"\bshall be considered\b|\bshall remain\b|\bshall be established\b"


def normtype(text: str, group: str) -> str:
    if has(CONSTITUTIVE_STRONG, text):
        return "constitutive"
    if group == "C":
        # "means (any|the|a|an)" so the NOUN "automated means" doesn't trip definition;
        # an unquoted definition the cue misses still lands on the group-C default below.
        if has(r"\bmeans (any|the|a|an)\b|\brefers to\b", text):
            return "definition"
        # a "This Regulation/Article… applies to…" opener is SCOPE even if it also
        # mentions Member State law (which the reference cue below would otherwise grab)
        if has(r"^\W*this (regulation|directive|article|chapter|section|part)\b"
               r"[^.]*\bappl(y|ies|icable)\b", text):
            return "scope"
        if has(CONSTITUTIVE_SOFT, text):       # "shall be considered as sensitive data"
            return "constitutive"
        # reference BEFORE scope: a routing cue wins even if the sentence says "apply"
        if has(r"\breferred to in\b|\blaid down in\b|\bset out in\b|mutatis mutandis|"
               r"member state law|\bdelegated act|\bimplementing act|empowered to adopt|"
               r"governed by (union|member state)|without prejudice|provided for in", text):
            return "reference"
        if has(r"\bshall not apply\b|\bappl(y|ies|icable)\b|\bscope\b", text):
            return "scope"
        if has(r"\bin accordance with\b", text):
            return "reference"
        return "definition"
    if group == "B":
        if has(r"\bright\b|\bentitled\b", text):
            return "right"
        if has(r"\bpenalt|\bfines?\b|\bliable\b|\bsanction|aggravating factor|"
               r"effective, proportionate and dissuasive|subject to .*(fine|penalt)", text):
            return "liability"
        if has(r"\bempower|\bpower\b|\bdesignate\b|\bmay adopt\b|\bdelegate\b|\bcompeten", text):
            return "power"
        return "right"
    # group A or D: detect the deontic force of the (possibly embedded) clause
    if has(r"\bshall not\b|\bmay not\b|\bmust not\b|\bprohibit|\bneither\b", text):
        return "prohibition"
    # duty-to-compensate -> liability (before permission: dodges the embedded "may suffer")
    if has(r"\bcompensate\b|\bshall be liable\b|\bliable for\b", text):
        return "liability"
    if has(r"\bmay\b|\bis permitted\b|\bshall be permitted\b|\bis allowed\b|\bpermitted to\b|"
           r"\bis free to\b|\bhas the option to\b", text):
        return "permission"
    if has(CONSTITUTIVE_SOFT, text):           # "the contract shall remain valid" (QUALIFIERS)
        return "constitutive"
    if has(r"\bright\b|\bentitled\b", text):       # qualifiers often embed a right
        return "right"
    return "obligation"


# ── modifiers: independent of group, lexical ───────────────────────────────────

CONDITIONAL = (
    r"\b(where|provided that|subject to|unless|if|in the event|on condition that|"
    r"as long as|to the extent that|when|save where|except where)\b"
)

TEMPORAL = [
    r"within\b[^.]{0,40}\b(day|hour|week|month|year)s?\b",
    r"period of\b[^.]{0,40}\b(day|hour|week|month|year)s?\b",
    r"\bwithout (undue )?delay\b",
    r"\bno longer than\b",
    r"\bat the time\b",
    r"\bdeadline\b",
]

EXEMPTION = [
    r"\bby way of derogation\b",
    r"\bderogation\b",
    r"\bshall not apply\b",
    r"\bdoes not apply\b",
    r"\bexcept\b",
    r"\bsave where\b",
    r"\bnotwithstanding\b",
    r"\bwithout prejudice\b",
]

INTERNAL_REF = r"\b(article|articles|paragraph|paragraphs)\s+\d|\breferred to in\b"
EXTERNAL_REF = r"\b(member state|national|union)\s+law\b|\bregulation \(e[cu]\)|\bdirective\b"


def crossref(text: str) -> str:
    i, e = has(INTERNAL_REF, text), has(EXTERNAL_REF, text)
    if i and e:
        return "both"
    if i:
        return "internal"
    if e:
        return "external"
    return "none"


def provisions(text: str) -> list[str]:
    """Blank-line-separated blocks; each block is one provision."""
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


def label(text: str, group: str, stem: str, n: int) -> dict:
    return {
        "id": f"{stem}-{n}",
        "source": stem,
        "normType": normtype(text, group),
        "exemption": any_of(EXEMPTION, text),
        "conditional": has(CONDITIONAL, text),
        "temporal": any_of(TEMPORAL, text),
        "crossRef": crossref(text),
        "text": text,
    }


def main() -> None:
    here = Path(__file__).resolve().parent
    training = here.parent / "resources" / "training"
    rows: list[dict] = []

    for path in sorted(training.glob("*.txt")):
        stem = path.stem
        group = GROUP.get(stem)
        if group is None:
            print(f"  ! skipping {path.name} — no group mapping")
            continue
        for n, prov in enumerate(provisions(path.read_text()), 1):
            rows.append(label(prov, group, stem, n))

    out = training / "labels.jsonl"
    out.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n")

    # distribution summary — class balance at a glance (drives the data budget).
    print(f"\nWrote {len(rows)} drafted labels → {out}\n")
    print("by source :", dict(Counter(r["source"] for r in rows)))
    print("normType  :", dict(Counter(r["normType"] for r in rows)))
    print("conditional:", sum(r["conditional"] for r in rows),
          " temporal:", sum(r["temporal"] for r in rows),
          " exemption:", sum(r["exemption"] for r in rows))
    print("crossRef  :", dict(Counter(r["crossRef"] for r in rows)))
    print("\n(draft — Pass 3 is hand-correcting labels.jsonl, esp. the ambiguous normTypes)")


if __name__ == "__main__":
    main()
