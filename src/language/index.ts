// The pipeline, tied together: source → split → parse-per-module → combine → registry.
// Three lines; everything construct-specific lives in the modules.

import { split } from "./pipeline/split.js";
import { combine, type Registry } from "./pipeline/combine.js";
import { emitProgram } from "./pipeline/emit.js";
import { MODULES } from "./pipeline/registry.js";
import type { Program } from "./pipeline/program.js";

export function parseProgram(source: string): Program {
  const blocks = split(source);
  const nodes = blocks.map((block) => MODULES[block.kind].parse(block));
  return { nodes };
}

export function compileProgram(source: string): Registry {
  return combine(parseProgram(source).nodes);
}

// The full back end: source → a self-contained JS module (string). Merge runs first so
// a conflicting program fails before any code is emitted.
export function emitJs(source: string): string {
  const program = parseProgram(source);
  combine(program.nodes); // merge check (conflicts throw)
  return emitProgram(program);
}
