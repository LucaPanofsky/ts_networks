export type { Operation, SerializedEnrichedNetwork, SerializedError } from "./types.js";
export { parse } from "./parse.js";
export { check } from "./check.js";
export { typecheck } from "./typecheck.js";
export { run } from "./run.js";
export { compileSchemas } from "./compile-schemas.js";
export { runGrammar } from "./run-grammar.js";
export { runTtable } from "./run-ttable.js";
export { diagram } from "./diagram.js";
export { pdfToText } from "./pdf-to-text.js";
export { compileJs } from "./compile-js.js";
export { runCompiled } from "./run-compiled.js";

import { parse } from "./parse.js";
import { check } from "./check.js";
import { typecheck } from "./typecheck.js";
import { run } from "./run.js";
import { compileSchemas } from "./compile-schemas.js";
import { runGrammar } from "./run-grammar.js";
import { runTtable } from "./run-ttable.js";
import { diagram } from "./diagram.js";
import { pdfToText } from "./pdf-to-text.js";
import { compileJs } from "./compile-js.js";
import { runCompiled } from "./run-compiled.js";
import type { Operation } from "./types.js";

export const operations: Operation<unknown, unknown>[] = [
  parse as Operation<unknown, unknown>,
  check as Operation<unknown, unknown>,
  typecheck as Operation<unknown, unknown>,
  run as Operation<unknown, unknown>,
  compileSchemas as Operation<unknown, unknown>,
  runGrammar as Operation<unknown, unknown>,
  runTtable as Operation<unknown, unknown>,
  diagram as Operation<unknown, unknown>,
  pdfToText as Operation<unknown, unknown>,
  compileJs as Operation<unknown, unknown>,
  runCompiled as Operation<unknown, unknown>,
];
