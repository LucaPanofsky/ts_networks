"""Spike: train the simple per-axis classifier on the drafted labels.

QUICK & DIRTY (exploration). This is the measurement step: it learns each axis
of ProvisionLabels from labels.jsonl and reports honest (cross-validated)
accuracy, so we see WHICH axes the data already supports and WHERE the model
confuses classes (the bet: right vs permission).

Pipeline per axis:  text -> spaCy lemmas -> TF-IDF (1-2 grams) -> logistic regression.
Evaluation: stratified k-fold cross_val_predict (every sentence predicted while
held out), so no train-on-test inflation. Small, auditable, ~1s to train.

NB: labels.jsonl is the RULE-DRAFTED key, not human-audited. So a high score can
mean "the model relearned the keyword rules", not "the task is solved" — read the
confusion matrix and top-features, not just the accuracy.

Run (from analysis/):  ../.venv/bin/python train.py
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import spacy
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline

AXES = ["normType", "conditional", "temporal", "exemption", "crossRef"]


def lemmatize(nlp, texts: list[str]) -> list[str]:
    """text -> space-joined lowercase lemmas (collapses inflection)."""
    out = []
    for doc in nlp.pipe(texts, disable=["parser", "ner"], batch_size=64):
        out.append(" ".join(t.lemma_.lower() for t in doc if not t.is_punct and not t.is_space))
    return out


def make_clf() -> Pipeline:
    return Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True)),
        ("lr", LogisticRegression(max_iter=2000, class_weight="balanced")),
    ])


def run_axis(name: str, X: list[str], y: list) -> None:
    counts = Counter(y)
    k = max(2, min(5, min(counts.values())))      # k can't exceed the smallest class
    cv = StratifiedKFold(n_splits=k, shuffle=True, random_state=0)
    pred = cross_val_predict(make_clf(), X, y, cv=cv)

    print(f"\n{'='*70}\n{name}   ({k}-fold CV, n={len(y)})\n{'='*70}")
    print(classification_report(y, pred, zero_division=0))

    if name == "normType":
        labels = sorted(set(y))
        cm = confusion_matrix(y, pred, labels=labels)
        print("confusion (row=true, col=pred):")
        print("        " + " ".join(f"{l[:4]:>5}" for l in labels))
        for i, l in enumerate(labels):
            print(f"{l[:7]:>7} " + " ".join(f"{cm[i][j]:5d}" for j in range(len(labels))))

        # auditable payoff: which words push toward each class
        print("\ntop words per class (TF-IDF + logreg coefficients):")
        clf = make_clf().fit(X, y)
        vocab = clf.named_steps["tfidf"].get_feature_names_out()
        coef = clf.named_steps["lr"].coef_
        for ci, c in enumerate(clf.named_steps["lr"].classes_):
            top = coef[ci].argsort()[::-1][:8]
            print(f"  {c:11}: " + ", ".join(vocab[t] for t in top))


def main() -> None:
    here = Path(__file__).resolve().parent
    rows = [json.loads(l) for l in (here.parent / "resources" / "training" / "labels.jsonl")
            .read_text().splitlines() if l.strip()]
    print(f"loaded {len(rows)} labels; lemmatizing…")

    nlp = spacy.load("en_core_web_sm")
    X = lemmatize(nlp, [r["text"] for r in rows])

    for axis in AXES:
        run_axis(axis, X, [r[axis] for r in rows])


if __name__ == "__main__":
    main()
