# `src/editor/` — STALE, not part of the alpha

This is an **abandoned** browser-based CodeMirror editor frontend for `.tsn` programs
(`main.ts` + the `language.ts` highlighting). It is kept for reference only:

> **Not maintained, not part of the alpha surface, and not to be revived.**

It is excluded from the codebase analysis (`npm run analyze`) and may not build against the
current source. The `npm run bundle` / `npm run dev` scripts that target it are legacy.

The supported way to work with programs is the CLI scripts (`npx tsx scripts/*.ts`) and the
MCP server (`npm run mcp`) — see the repo [README](../../README.md) **Getting Started**.
