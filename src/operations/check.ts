import { parseProgram } from "../data-network/tree-to-network.js";
import type { Operation } from "./types.js";

type CheckInput = { source: string };
type CheckOutput = { ok: true } | { ok: false; error: string };

export const check: Operation<CheckInput, CheckOutput> = {
  name: "check",
  description: "Parse a ts-networks program and report any syntax errors.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "The ts-networks source code to parse." },
    },
    required: ["source"],
  },
  handle(input) {
    try {
      parseProgram(input.source);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};
