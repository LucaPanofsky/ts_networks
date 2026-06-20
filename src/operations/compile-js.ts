import { emitJs, parseProgram } from "../language/index.js";
import { ConstructKind } from "../language/core/enums.js";
import type { Operation } from "./types.js";

// Compile a ts-networks program to a self-contained JavaScript artifact — the "compile once"
// half of the language's compile-once/run-anywhere story. The emitted module imports
// `@tsn/runtime`, builds one registry of leaves, and carries a manifest of its networks.
// `networks` is returned alongside as a convenience (it mirrors the artifact's `__manifest`).

type CompileJsInput = { source: string };
type CompileJsOutput =
  | { ok: true; code: string; networks: Record<string, { from: string[]; to: string }> }
  | { ok: false; error: string };

export const compileJs: Operation<CompileJsInput, CompileJsOutput> = {
  name: "compile-js",
  description:
    "Compile a ts-networks program to a self-contained JavaScript artifact (one registry of leaves).",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The ts-networks source code." },
    },
    required: ["source"],
  },
  handle(input) {
    try {
      const code = emitJs(input.source); // parse + merge-check + emit
      const networks: Record<string, { from: string[]; to: string }> = {};
      for (const node of parseProgram(input.source).nodes) {
        if (node.kind === ConstructKind.Network) {
          networks[node.name] = { from: node.signature.from, to: node.signature.to };
        }
      }
      return { ok: true, code, networks };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};
