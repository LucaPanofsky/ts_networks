export type { Operation, SerializedEnrichedNetwork, SerializedError } from "./types.js";
export { parse } from "./parse.js";
export { check } from "./check.js";
export { typecheck } from "./typecheck.js";
export { run } from "./run.js";
export { compileSchemas } from "./compile-schemas.js";

import { parse } from "./parse.js";
import { check } from "./check.js";
import { typecheck } from "./typecheck.js";
import { run } from "./run.js";
import { compileSchemas } from "./compile-schemas.js";
import type { Operation } from "./types.js";

export const operations: Operation<unknown, unknown>[] = [
  parse as Operation<unknown, unknown>,
  check as Operation<unknown, unknown>,
  typecheck as Operation<unknown, unknown>,
  run as Operation<unknown, unknown>,
  compileSchemas as Operation<unknown, unknown>,
];
