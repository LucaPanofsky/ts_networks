import { emitJs } from "../language/index.js";
// The STRICT parser (rejects leading garbage, reports line-numbered syntax errors) — the same
// validator `check`/`typecheck` use. `emitJs` parses with the more lenient split-based parser,
// so we validate here first to preserve the engine `run`'s syntax-error contract.
import { parseProgram } from "../data-network/tree-to-network.js";
import { runCompiled } from "./run-compiled.js";
import type { Operation } from "./types.js";

type RunInput = {
  source: string;
  network: string;
  cells: Record<string, string>;
};

type RunOutput =
  | { ok: true; network: string; cells: Record<string, unknown> }
  | { ok: false; error: string };

// Compile a ts-networks program and run one of its networks. This is the modular emit path:
// `emitJs` compiles the source to a self-contained `.js` artifact (parse + merge-check +
// emit), then `run-compiled` loads and runs it in-process. (The engine `jsgen` run path it
// used to call is retired — there is now ONE emit path.) Cell seeding, the full tool resolver,
// and all-cells output all live in `run-compiled`; this is the compile-from-source front door.
export const run: Operation<RunInput, Promise<RunOutput>> = {
  name: "run",
  description: "Compile and execute a ts-networks network with given cell inputs.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The ts-networks source code." },
      network: { type: "string", description: "Name of the network to run." },
      cells: {
        type: "object",
        description:
          "Map of cell names to initial values. Each value is a JavaScript expression evaluated " +
          "in the program's sandbox, or `@filename` to seed the raw text of a file from the " +
          "workspace (read verbatim, not evaluated).",
        additionalProperties: { type: "string" },
      },
    },
    required: ["source", "network", "cells"],
  },
  async handle(input) {
    const { source, network, cells } = input;
    if (!source) return { ok: false, error: "source is required" };
    if (!network) return { ok: false, error: "network is required" };

    let code: string;
    try {
      // Validate syntax through the STRICT parser first — it rejects leading garbage and
      // reports line-numbered `Syntax error at line X, col Y` (the emit splitter is more
      // lenient and would silently drop unparseable leading text). Then emit: combine
      // (merge-check) + codegen. Either failure is a compile error, with the engine's prefix.
      parseProgram(source);
      code = emitJs(source);
    } catch (e) {
      return { ok: false, error: `compile error: ${e}` };
    }

    return runCompiled.handle({ code, network, cells });
  },
};
