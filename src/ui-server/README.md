# `src/ui-server/` — STALE, not part of the alpha

This is the **abandoned** Express dev-server that backed the browser editor (`server.ts`,
the `mermaid.ts` diagram renderer, the REPL parser, the run handler). It is kept for
reference only:

> **Not maintained, not part of the alpha surface, and not to be revived.**

Some of its capabilities have current, supported homes instead: network diagrams are now
produced by `scripts/diagram.ts` (the `diagram` operation), and program execution by
`scripts/run.ts` (the `run` operation). Use those.

See the repo [README](../../README.md) **Getting Started** for the supported surface (CLI
scripts + the MCP server).
