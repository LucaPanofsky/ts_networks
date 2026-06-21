# Findings — preliminary spaCy pass over `resources/sample.txt`

> **What this is:** the result of running `parse_sample.py` (pretrained `en_core_web_sm`,
> **zero training**) over 10 real regulatory provisions (GDPR / AI Act / Data Act). It answers
> one question: *what does an off-the-shelf parser actually give us, and where does it run out?*
> Nothing here is a decision — it's evidence to design the rules against.

**Artifacts**

- `parse_sample.py` — the harness (seed of the eventual `app/parse.py`).
- `results.json` — the structured output. Shape: `provisions[] → sentences[] → modals[]`,
  where each modal carries `{governs, subject, object, passive, reading}`; each sentence also
  carries `tokens[]` — the **raw dependency parse** (`text/lemma/pos/tag/dep/head`), i.e. the
  unfiltered thing the model returns. Open this to *see* the parse.

To reproduce: `cd analysis && ../.venv/bin/python parse_sample.py`.

---

## The one finding that matters

**"shall" is not a modality — the verb it governs is the signal — and the parser extracts that
link reliably.** For every modal we read `modal.head` (the verb it attaches to). That verb sorts
the norm into three buckets, cleanly, on real text:

| governed verb | meaning | examples in the sample |
|---|---|---|
| **act verb** (communicate, submit, implement, take, designate, demonstrate, perform) | **obligation to act** | P1, P5, P6, P7, P8, P9 |
| **have** | **conferral of a right/power** — *not* an obligation | P4 *"shall **have** voting rights"*, P5 *"shall **have** the right to participate"* |
| **be + deemed / bound** (copular/passive) | **constitutive** — defines a legal state, not an act | P3 *"shall **be deemed** to be in agreement … shall **be bound** by it"* |

This is the encouraging result: `shall have` and `shall be deemed` were correctly **not** treated
as obligations. The `subject / modality / action / object` skeleton is genuinely recoverable for
clean sentences (e.g. P6 → subject `the controller`, action `implement`, object `appropriate
technical and organisational measures…`).

---

## Where it breaks — three different kinds of failure

The failures are **not** all "ML is hard". They sort into three categories, and only the third is
genuinely an ML problem. This is the practical map of the work.

### 1. Model-quality failures — likely fixed by a bigger model

The *small* model drops the subject when the sentence is heavily subordinated:

- **P2** *"Where … expresses …, the lead supervisory authority shall … submit the matter"* →
  `subject: ""`. The long `Where…` preamble severed the subject→verb link.
- **P10** *"The EDIB **referred to in Article 42** shall advise…"* → `subject: ""`; the relative
  clause between subject and verb broke attachment.

These are exactly the long-range dependencies that the **transformer model (`en_core_web_trf`)**
handles far better. **Open question — the decisive next experiment:** re-run this same harness
with `trf` and measure how many category-1 failures vanish. That tells us whether the bottleneck
is the *model* (cheap: swap weights) or the *approach* (real work).

### 2. Text-structure / preprocessing failures — these are *Rules*, before the parser

Half the work is **normalizing the text before it ever reaches the parser**. This is the concrete
meaning of "Rules" on the input side:

- **Footnote markers** — P1 sentence 2 → `subject: "2It"`. The `2` is a glued-on footnote number;
  the real subject is "It". → strip leading enumeration markers.
- **Colon-lists** — P7 *"providers … shall: perform…; assess…; keep track…"* → only **`perform`**
  was captured. One `shall:` governs *many* enumerated obligations, but the parse only puts the
  first under the modal. → **explode `shall:` lists into separate provisions before parsing.**
- **Coordination** — P3 *"shall be deemed … **and** shall be bound"* and P10 *"advise **and**
  assist"* → the second verb's shared subject/object came back empty. → the post-parse rules must
  follow the `conj` edge to share subject/object across coordinated verbs.
- **Relative-clause modals** — P7 grabbed a spurious **`may stem`** from *"risks that **may** stem
  from"* — an epistemic "may" inside a relative clause, not the provision's deontic core. → only
  the **root-attached** modal of the main clause counts.

### 3. Genuinely needs more ML — later, not now

- **Coreference** — P1 *"**It** shall submit"*: resolving "It" → "the lead supervisory authority"
  is a separate coref problem. v1 can keep the surface subject and flag it.
- **Legal-actor NER is wrong** with the small model: `The Chair of the Board → WORK_OF_ART`,
  `Articles 53 and 54 → DATE`, `2It → CARDINAL`. *But* we may not need NER at all — the dependency
  `nsubj` already gave better subjects than NER did. NER (custom-trained on legal roles) is a
  later refinement, not a v1 dependency.

---

## What this implies for the design

The pipeline is **Rules → parser → Rules**, not just "parser → Rules":

1. **pre-parse normalize** (pure text rules): strip footnote markers, explode `shall:` colon-lists
   into one-provision-each, possibly split on `Where …,` preambles into *condition* + *norm*.
2. **parse** (the ML — pretrained, zero training): dependency tree per sentence.
3. **post-parse extract** (tree-walking rules): take the root-clause modal, read its governed verb
   to set modality, follow `conj` for coordination, read `nsubj` / `dobj` for subject / object.

And the modality rule is **not** a keyword table on "shall" — it's a small classifier on the
*governed verb*: `have → right`, `be+{deemed,bound,considered} → constitutive`, action-verb →
obligation. The fuzzy residue (is a constitutive/conditional clause really an **exemption**?) is
where a *trained* classifier would eventually earn its place — but the parse already carries us
much further than the naive `shall → obligation` rule would have.

## Status / next step

- ✅ Validated: governed-verb disambiguation works and is reliably extracted by `sm`.
- ⏭️ **Next experiment:** re-run with `en_core_web_trf` to separate model-quality limits
  (category 1) from approach limits. Decide *after* that whether `sm` is enough for v1.
- ⛔ Not yet: classifier, coref, custom NER, language integration.
