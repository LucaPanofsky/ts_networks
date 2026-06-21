# MLSERVICE — a model-inference host for the language

> **Status:** design sketch (v0). Exploratory code lives in [`analysis/`](analysis/);
> nothing is committed as the service yet. This README is the thing to react to before
> we build the real service.

## What this is

A **separate Python microservice** whose only job is to **host machine-learning models and
return their native output over HTTP**. It is a *containerized peer* of the Gavagai
container: its own image, wired in via `docker-compose`, reachable on the internal network.
From the **language's** point of view it is just **a tool to integrate** — the same way an
external LLM is a tool. Nothing in `src/language/` changes to accommodate it; eventually a
leaf calls it over HTTP.

The defining constraint — and the thing that makes this design clean:

> **The ML server hosts models and returns each model's native output — nothing more.**
> **Every deterministic transformation lives in `.tsn`.**

No legal-domain logic, no record assembly, no "rules" live in Python. The server runs a
frozen parser and hands back the **raw dependency tree**; later it runs a trained classifier
and hands back the **raw label vector**. Everything in between — and everything after — is
authored in the language, where humans and agents co-maintain it under the type system.

Why a separate service and not part of the TS runtime:

- The useful NLP/ML ecosystem (**spaCy**, **transformers**, **SetFit**) is Python-native.
- It keeps Python, model weights, and ML dependencies **out of** the Node runtime.
- It can be built, scaled, restarted, or swapped **independently** of the language.
- It matches the project's stance: an ML model is a **deterministic, auditable artifact**
  (capex), not an LLM you interpret every document with (opex).

## Where the work lives — the boundary

This is the whole point of the redesign, so it is stated first.

```
  text
    → [.tsn]   normalize         strip footnotes, explode colon-lists  (deterministic → language)
    → [leaf]   parse             the ML — a frozen parser, model-native tree out
    → [.tsn]   extract/featurize the "linguistic-model" — bearer/modal/action, follow conj
    → [leaf]   classify (later)  the ML — a trained model, raw label vector out
    → [.tsn]   assemble          → LegalProvision record
```

Two boxes are ML inference behind the leaf (`parse`, later `classify`); **everything else is
ordinary record-transformation in the language.** The server is dumb on purpose: you can
upgrade the parser (`sm → trf`) or retrain the classifier without touching a line of the
extraction logic, because that logic isn't in Python.

### The ML leaf is the true counterpart of `defgrammar`

The reason the deterministic half belongs in `.tsn` is that it already has a home there. A
parse leaf is, structurally, *exactly* what a `defgrammar` is:

| | engine | input | output |
|---|---|---|---|
| `defgrammar` | an Ohm grammar **we author** | text | record tree |
| **ML parse leaf** | a parser **someone else trained** | text | record tree (the dependency parse) |

Same operation — `text → record-tree` — different engine. And crucially, **whatever comes
after is identical**: you have a tree of records, and you transform it with the language's
ordinary machinery (`defn`, network wiring, the `defextract` style of "walk a tree, emit
records"). The old notion of "Rules" was never a separate ML concern — it is just
record-tree transformation, which is the language's wheelhouse. **We parse the parse — in
the language.**

## The concrete first goal (the GDPR example)

Turn a regulatory sentence into a **typed record**. Given:

> The controller shall document any personal data breaches …

produce:

```json
{
  "subject":  "SUBJECT",                       // was "the controller"
  "modality": "obligation",                    // from the governed verb under "shall"
  "action":   "document",
  "object":   "any personal data breaches"
}
```

That record is the whole point: it is exactly the kind of thing the language already models
with `defrecord`, and it is **produced by a `.tsn` program** that calls the parse leaf and
walks the result — the *semantic* counterpart to `defgrammar` (which is lexical and cannot do
this). The ML service contributes only the parse tree the program walks.

There are two distinct jobs hiding in that record, and they split cleanly across the boundary:

| Job | What it does | Where it runs | When |
|-----|--------------|---------------|------|
| **Structural decomposition** | split the sentence into `subject / modality / action / object` | **`.tsn`** over the parse tree (parser does the syntax, language does the extraction) | **v1** |
| **Norm-type classification** | the fuzzy semantic call: *permission / exemption / prohibition?* | a **trained classifier** on the server; featurization in `.tsn` | later |

**v1 is the structural half only.** Prove the plumbing — leaf returns a tree, language walks
it into the record — before investing in labeled data.

---

## Output schema (converging design)

The program produces **one record per provision**, organized in **two tiers by provenance** —
so you always know which fields are deterministic extraction and which are a model's
*judgment*:

```
LegalProvision {

  // ── FRAME ──  extracted in .tsn from the parse tree (deterministic — the linguistic-model)
  bearer     : Text                       // subject span — "the controller"
  modal      : Text                       // "shall" / "may"
  action     : Text                       // governed verb lemma — "implement"
  target     : Text                       // object span
  voice      : active | passive
  references : [{ text: Text, kind: internal | external }]   // cross-ref payload

  // ── LABELS (ProvisionLabels) ──  the multidimensional vector — 5 axes predicted together
  normType    : obligation | prohibition | permission           // A — deontic force
              | right | power | liability                       // B — potestative position
              | definition | scope | reference | constitutive   // C — constitutive / non-normative
  conditional : Bool                       // D1 — "where", "provided that", "unless"
  temporal    : Bool                       // D2 — deadlines, "within 72 hours"
  exemption   : Bool                       // A4 — "by way of derogation", "shall not apply"
  crossRef    : none | internal | external | both              // derived from `references`
}
```

**Terminology.** The **linguistic-model** is the set of columns the `.tsn` program computes
from the parse tree (featurization: the leaf runs frozen spaCy and returns the tree, then the
language adds columns — *no learning*). The classifier reads the linguistic-model and predicts
the **Labels** tier.

**How the axes map onto the taxonomy** ([`resources/model.md`](resources/model.md)). The
hierarchy's two levels become the vector's structure: groups that are **mutually exclusive per
atomic provision** collapse into **one categorical axis** (`normType` = the A∪B∪C leaves — a
clause is *one* primary force), while groups that **co-occur** become **separate axes**
(`conditional`/`temporal` = the D qualifiers; `exemption` = A4; `crossRef`). The group level
(A/B/C) is **derived** from `normType`, not stored.

**Why "multidimensional".** The Labels are a **vector of independent questions**, not one
verdict — a provision is several things at once. E.g. *"shall be deemed … and bound"* is
`normType=constitutive` **and** `conditional=true` simultaneously; one flat label cannot hold both.

**The axes are not equal cost — and we have now measured it** (per-axis cross-validated training
on the drafted labels). This is the planning insight for curating data and for the boundary:

| axis | who really fills it | needs training data? |
|---|---|---|
| `normType` | the **trained classifier** — the genuinely semantic call (`shall have`→right, `shall be deemed`→constitutive). The *only* axis the model meaningfully beats rules on. | **yes — this is the point** |
| `conditional`, `temporal`, `exemption` | **deterministic `.tsn` rules** — measured lexical (f1 ≈ 0.8 from keywords alone) | no |
| `crossRef` | **deterministic** — a *derived projection* of the extracted `references` list (SSoT: the axis can never disagree with the list; `both` = references external law *and* an internal paragraph) | no |

So the ML budget goes to **`normType` only**; the other four axes are glue. Weight the curated
set toward the cases that stress `normType` — that's where the model learns what a rule can't.
The candidate value space for `normType` is the A/B/C leaves of the taxonomy in
[`resources/model.md`](resources/model.md).

---

## Where this leads: provisions as executable norms (SVOMPT)

The schema above is not the destination — it's the *operands* of a tiny program. The longer-term
bet: for many provisions, the `(Frame, normType)` pair **compiles to an executable norm**.

Read the Frame as a **SVOMPT** signature — *Subject · Verb · Object · Modal · Place · Time*
(`bearer · action · target · normType · scope · temporal`). The **object is treated as an opaque
state-string** — an atom that is simply true or false, its content *uninterpreted*. `normType` is
the **opcode** that fixes a truth table over that atom:

```
obligation(P):   P → lawful,   ¬P → unlawful
prohibition(P):  P → unlawful, ¬P → lawful        (= obligation(¬P), the dual)
permission(P):   lawful either way                 (no constraint; defeats a prohibition)
```

So a provision is a **total function from states to {lawful, unlawful}**, and you can *enumerate*
every state's verdict with **zero world-knowledge**. Conjunctions, conditions (`conditional`), and
exemptions (`exemption`) are just **boolean structure over more opaque atoms** — still a truth
table. The result is plain **propositional logic over uninterpreted atoms**: decidable, enumerable,
free.

The ambiguity of law is **bracketed out by design**: deciding whether an atom is *true* for a real
party is a separate, downstream concern the program never touches. You don't resolve which state
holds — you give the verdict for each. That is the source of robustness.

There are only **3–4 program families** — the A/B/C/D groups as *kinds* of program: **Deontic**
(A) = conduct evaluators (the truth table above); **Potestative** (B) = correlative duties (a right
is a duty on another party), state-transitions (power), `breach → sanction` (liability);
**Constitutive** (C) = the type & scope *environment* the others run in (definition = type decl,
scope = applicability guard, reference = import, constitutive = assignment); **Qualifiers** (D) =
guards on a program (`conditional` = `if`, `temporal` = deadline).

This is propagation-network-native: a SVOMPT program *is* a small network — atoms are cells, the
verdict is a derived cell, an under-determined provision is partial information, and a
**contradiction in the merge algebra is exactly "unlawful."** The only real work is the clean
extraction of atoms + opcode (the parser-plus-Frame work above) — never interpreting them.

---

## Proposed API

Keep the surface **minimal and model-shaped**: one endpoint per hosted model, each returning
that model's raw output. No assembled records — assembly is the language's job.

- `POST /parse` — body `{ "text": "<text>" }` → returns the **raw dependency parse**: a list of
  tokens `{ text, lemma, pos, tag, dep, head }` (the tree, encoded by head-pointers), plus
  named entities. This is exactly the shape the exploratory
  [`analysis/results.json`](analysis/) already emits.
- `POST /classify` *(later)* — body `{ "features": { … } }` (the linguistic-model computed in
  `.tsn`) → returns the **raw label vector**. Added only at step 4, once there's a trained model.

A thin **FastAPI** app (recommended — typed request/response, free OpenAPI docs). The language
leaf would later just `POST /parse`, receive the token tree as a record, and the `.tsn` program
walks it into a `LegalProvision`.

## Proposed layout

```
MLSERVICE/
  README.md            ← this design
  resources/           ← sample provisions + the label taxonomy (model.md)
  analysis/            ← exploratory spikes (quick & dirty — see below)
  app/                 ← the real service (not built yet)
    main.py            ← FastAPI app + endpoints (the HTTP surface)
    parse.py           ← wraps the frozen parser — runs it, serializes the tree. THAT'S ALL.
    models.py          ← request/response shapes (pydantic)
  requirements.txt
  Dockerfile
```

Note what is **absent**: there is no `rules.py`. The deterministic tree-walking that earlier
drafts put in Python is now `.tsn`. `app/` stays thin — load a model, run it, serialize its
native output.

`docker-compose.yml` (at repo root, alongside Gavagai's compose) adds this as a service on the
shared network so the Gavagai container can reach it at e.g. `http://mlservice:8000`.

## Right now: exploration is quick-and-dirty Python

Before any of the structure above is real, we are still **figuring out the problem**: what does
the parser actually return, where does it break, what does the linguistic-model need to compute?
That work happens in [`analysis/`](analysis/) as **quick-and-dirty Python** — fine to be messy;
its job is to *teach us the shape of the problem*, not to ship. The clean `app/` service and the
in-language enrichment come **after**. The current spikes:

- `parse_sample.py` / `parse_raw.py` — run the parser over real provisions, dump the raw tree (the
  shape the `/parse` leaf will expose). See [`FINDINGS.md`](analysis/FINDINGS.md) — headline:
  *"shall" is not a modality; the verb it governs is the signal*.
- `prelabel.py` — draft the `ProvisionLabels` vector for every sentence in
  [`resources/training/`](resources/training/) by lexical rules → `labels.jsonl` (the answer key).
  Re-run after adding raw sentences; it prints the per-class distribution (the curation scoreboard).
- `train.py` — per-axis classifier (lemmas → TF-IDF → logistic regression), cross-validated.
  Finding: **`normType` is the only genuine ML axis**; the other four are deterministic rules.
- `audit.py` — surfaces the labels most likely wrong (model disagrees with the rule) for review.

## Build path (each step independently useful)

0. **Exploration spikes** *(in progress)* — quick Python in `analysis/`; run the parser over
   real provisions, eyeball the tree, write findings. Goal: understand the problem, not ship.
1. **Standalone `/parse` server** — a thin FastAPI app that returns the raw parse tree. No
   Docker, no language. Proves the model-inference surface.
2. **Containerize** — `Dockerfile` + a compose service. Proves it runs isolated.
3. **Wire into Gavagai** — same compose network; Gavagai can reach `/parse`. Proves reachability.
4. **Enrichment in `.tsn`** — author the normalize → parse-leaf → extract pipeline in the
   language, producing the `Frame` tier of `LegalProvision`. This is where the parse tree
   becomes a typed record **without any Python logic**.
5. *(later)* **Add the trained classifier** for the `Labels` tier (SetFit on Legal-BERT),
   exposed as `/classify`; the language featurizes, the server predicts.

## Explicitly NOT now

- No *trained* classifier in the service yet (that's step 5) — there's an exploratory drafted
  label set under `resources/training/`, not a shipped model.
- No record assembly in Python — ever. The server returns model output; the language assembles.
- No language integration yet (that's steps 3–4) — current work is a parser you `curl`.
- No model-selection bikeshedding — exploration picks one pretrained parser and moves.

---

### One open choice for you

Which pretrained stack to start with for the `/parse` surface:

- **spaCy alone** — dependency parse + NER, one `pip install`, fastest to stand up. Gets
  subject/action/object from grammar, slightly less robust to passive phrasing.
- **spaCy + a separate SRL model** — adds a role layer (robust `ARG0`/`ARG1`), a bit more setup
  and a heavier image.

My lean: **spaCy alone** to start (cheapest proof). The
[findings](analysis/FINDINGS.md) flag a decisive next experiment — re-run with
`en_core_web_trf` and measure how many parse failures vanish — which tells us whether the
bottleneck is the *model* (cheap: swap weights) or the *approach* (real work). Add the SRL role
layer only if passive-voice provisions demand it. Start simple; add capability in response to
observed need, not in anticipation.
