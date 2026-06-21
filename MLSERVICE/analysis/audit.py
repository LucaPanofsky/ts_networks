"""Audit helper: surface the normType labels most likely to be WRONG.

We have no ground truth yet — every label is a rule guess. This trains the
normType classifier out-of-fold and flags the rows where the model DISAGREES
with the rule-drafted label, or is low-confidence (small top-2 margin). Those
are the labels to hand-check first; correcting them is what turns the rule
draft into real ground truth (and de-leaks the accuracy number).

Priority goes to the confused pairs from train.py's matrix:
  permission↔obligation · right↔liability · reference↔definition/scope.

Writes audit_batch.jsonl (full disagreement list) and prints the top slice.

Run (from analysis/):  ../.venv/bin/python audit.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import spacy
from sklearn.model_selection import StratifiedKFold, cross_val_predict

from train import lemmatize, make_clf

# pairs we most expect to be mislabeled (unordered)
PAIRS = {
    frozenset(("permission", "obligation")),
    frozenset(("right", "liability")),
    frozenset(("reference", "definition")),
    frozenset(("reference", "scope")),
    frozenset(("definition", "scope")),
}

LOW_MARGIN = 0.20      # top1 - top2 below this = model is unsure


def main() -> None:
    here = Path(__file__).resolve().parent
    path = here.parent / "resources" / "training" / "labels.jsonl"
    rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]

    nlp = spacy.load("en_core_web_sm")
    X = lemmatize(nlp, [r["text"] for r in rows])
    y = [r["normType"] for r in rows]

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)
    proba = cross_val_predict(make_clf(), X, y, cv=cv, method="predict_proba")
    classes = list(np.unique(y))      # column order of proba

    flagged = []
    for i, r in enumerate(rows):
        p = proba[i]
        order = np.argsort(p)[::-1]
        top1, p1 = classes[order[0]], float(p[order[0]])
        top2, p2 = classes[order[1]], float(p[order[1]])
        rule = r["normType"]
        p_rule = float(p[classes.index(rule)])
        disagree = top1 != rule
        unsure = (p1 - p2) < LOW_MARGIN
        if not (disagree or unsure):
            continue
        flagged.append({
            "id": r["id"],
            "rule": rule,
            "model": top1,
            "p_model": round(p1, 2),
            "p_rule": round(p_rule, 2),
            "second": top2,
            "disagree": disagree,
            "priority": disagree and frozenset((top1, rule)) in PAIRS,
            "text": r["text"],
        })

    # priority pairs first, then most-suspicious (lowest probability on the rule label)
    flagged.sort(key=lambda f: (not f["priority"], f["p_rule"]))

    out = here / "audit_batch.jsonl"
    out.write_text("\n".join(json.dumps(f, ensure_ascii=False) for f in flagged) + "\n")

    n_dis = sum(f["disagree"] for f in flagged)
    n_pri = sum(f["priority"] for f in flagged)
    print(f"{len(flagged)} rows flagged  ({n_dis} disagreements, {n_pri} on confused pairs, "
          f"rest low-confidence)  →  {out}\n")
    print("FIRST BATCH — model disagrees with the rule, on the confused pairs:")
    print(f"{'rule →  model':>24}  {'p_m/p_r':>9}   text")
    print("-" * 110)
    for f in flagged[:40]:
        tag = f"{f['rule']} → {f['model']}"
        print(f"{tag:>24}  {f['p_model']:.2f}/{f['p_rule']:.2f}   {f['text'][:70]}")


if __name__ == "__main__":
    main()
