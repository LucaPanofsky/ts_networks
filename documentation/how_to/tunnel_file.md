# How to: the session tunnel file

A **tunnel file** is a single, hand-maintained document that *tunnels* a fresh Claude agent
straight to the live edge of development — the concrete code state, the working conventions, and
the open threads that a new session needs but that don't belong in committed docs. In this repo it
lives at `CLAUDE_TUNNEL.md` in the project root and is **gitignored, deliberately**: it is scratch,
not source.

It sits between two slower stores and should not duplicate them:
- **`CLAUDE.md`** (committed) — stable dev scripts, test commands, and non-negotiables.
- **Persistent memory** (`.claude/.../memory/`, auto-loaded via `MEMORY.md`) — positioning,
  feedback, durable facts.

The tunnel carries what those don't: *where the work actually is right now*.

---

## Principles

1. **General to specific.** A reader should be able to stop early and still have the right mental
   model. Open with who they are and the problem; then the branch/PR state; then the current
   stream; then the details. Long reference lists (gotchas, deferred threads, condensed history) go
   last, in the appendix.
2. **Consolidate, don't accrete.** Each update folds settled work into a one-line "prior arc"
   mention and keeps only what is live. The tunnel is a *current* picture, not a transcript.
3. **Load-bearing only.** Record a fact if a new agent would get it wrong or waste time without it
   (a non-obvious gotcha, an invariant, an open decision). Don't restate the code or the git log.
4. **Point, don't copy.** Link to `CLAUDE.md`, memory, the PR, and design docs rather than
   inlining them.

## Maintenance

After a consistent part of development is consolidated and committed, **suggest to the Stakeholder
to update the tunnel file** (don't rewrite it unprompted — it's their ledger of intent).

The tunnel grows over time. When keeping it current becomes a burden, that is the signal to **draft
a fresh tunnel from the template below**: fold the finished streams into the condensed-history
appendix and reset the body to the live state. A good tunnel is short; a sprawling one is a prompt
to consolidate.

---

## The template

Copy this skeleton into `CLAUDE_TUNNEL.md` and fill the comment slots. Keep the headings; drop
appendix subsections you don't need.

```markdown
# Who Are you

A new Claude Agent working on the <project> project. This file tunnels you to the latest stream of
development, practices and conventions.

// Name the slower stores to read first (committed CLAUDE.md, persistent memory) and note that this
// file is gitignored scratch that carries the live state they don't.

# Context and Development

## Problem Overview

// Describe the problem, use case, and goals — at the depth the current conversation needs. Why
// does this project exist; what is the current stream trying to achieve.

## Development Process and Conventions

// The conventions that govern THIS stream of development: git/PR rhythm, testing discipline,
// any architectural invariant a change must preserve, who the Stakeholder is and how they work.
// Reference CLAUDE.md / memory instead of restating them in full.

# Where are we

// A short summary in well-separated paragraphs, flowing from general to specific.
// Start from the branch state and any attached PRs / issues, then the current stream, then what
// is and isn't done.

# Changelog

// Updates, most recent first. One entry per consolidated step; link commits where useful.

# Appendix

## Tunnel Maintenance

// After a consistent part of development is consolidated and committed, suggest to the Stakeholder
// to update the tunnel file.
//
// The tunnel file tends to grow over time. When the file maintenance becomes a burden it is a good
// sign it's the moment to draft a new tunnel from a consolidated template.

// Optional further appendix subsections for reference material that would clutter "Where are we":
//   ## Active gotchas        — load-bearing traps not already in CLAUDE.md
//   ## Deferred / open threads — what's parked, and why
//   ## Foundations (condensed) — settled history, one paragraph
//   ## Gitignored / untracked  — what lives outside git
```

---

## See also

- [The language agent](../lang_agent.md) and
  [Extending the language agent UI](extending_lang_agent_ui.md) — the current development stream the
  tunnel most often points into.
